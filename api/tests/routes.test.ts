import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { extraction, loadPriceList, loadSample } from "./helpers.js";

const app = buildApp({ logger: false });
afterAll(() => app.close());

const post = async (url: string, payload: unknown) => {
  const res = await app.inject({ method: "POST", url, payload: payload as object });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
};

describe("POST /validate", () => {
  it("accepts LLM output wrapped in a ```json fence", async () => {
    const data = '```json\n{"category":"order","confidence":0.97,"language":"en","summary":"Order for chairs"}\n```';
    const res = await post("/validate", { schema: "classification", data });
    expect(res).toEqual({
      status: 200,
      body: { ok: true, data: { category: "order", confidence: 0.97, language: "en", summary: "Order for chairs" } },
    });
  });

  it("normalizes SKUs in extraction output", async () => {
    const data = extraction({ items: [{ sku: " chr-erg-01 ", quantity: 2 }] });
    const res = await post("/validate", { schema: "extraction", data });
    expect((res.body.data as { items: unknown }).items).toEqual([{ sku: "CHR-ERG-01", quantity: 2 }]);
  });

  it("rejects free text", async () => {
    const res = await post("/validate", { schema: "classification", data: "Sure! This is an order." });
    expect(res.body).toMatchObject({ ok: false, code: "INVALID_JSON" });
  });

  it("rejects output that does not match the schema", async () => {
    const data = { category: "spam", confidence: 2, language: "en", summary: "" };
    const res = await post("/validate", { schema: "classification", data });
    expect(res.body).toMatchObject({ ok: false, code: "SCHEMA_MISMATCH" });
  });

  it("rejects prices smuggled into the extraction", async () => {
    const data = { ...extraction(), items: [{ sku: "CHR-ERG-01", quantity: 1, unitPrice: 1 }] };
    const res = await post("/validate", { schema: "extraction", data });
    // zod strips unknown keys, so the price never reaches pricing.ts
    expect((res.body.data as { items: unknown }).items).toEqual([{ sku: "CHR-ERG-01", quantity: 1 }]);
  });
});

describe("POST /guard", () => {
  it("flags the injection sample", async () => {
    const res = await post("/guard", { email: loadSample("injection-attack.txt") });
    expect(res.body).toMatchObject({ ok: true, flagged: true });
  });

  it("passes the order sample with its extraction", async () => {
    const res = await post("/guard", { email: loadSample("order-ok.txt"), extraction: extraction() });
    expect(res.body).toEqual({ ok: true, flagged: false, reasons: [] });
  });

  it("returns BAD_REQUEST for a malformed body", async () => {
    const res = await post("/guard", { email: { body: "x" } });
    expect(res.body).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
});

describe("POST /price", () => {
  it("prices items using string values from Sheets", async () => {
    const priceList = loadPriceList().map((p) => ({ ...p, unitPrice: String(p.unitPrice) }));
    const res = await post("/price", { items: [{ sku: "LMP-LED-05", quantity: 2 }], priceList });
    expect(res.body).toMatchObject({ ok: true, offer: { subtotal: 318, discountPercent: 0, total: 318 } });
  });

  it("returns UNKNOWN_SKU as a handled error", async () => {
    const res = await post("/price", { items: [{ sku: "NOPE-1", quantity: 1 }], priceList: loadPriceList() });
    expect(res).toEqual({ status: 200, body: { ok: false, code: "UNKNOWN_SKU", error: "Unknown SKU(s): NOPE-1" } });
  });
});

describe("error handling", () => {
  it("returns the error envelope for invalid JSON bodies", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/guard",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, error: "Malformed request", code: "BAD_REQUEST" });
  });
});
