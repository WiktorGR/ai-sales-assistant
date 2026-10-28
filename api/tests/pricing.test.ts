import { describe, expect, it } from "vitest";
import { discountPercentFor, priceOrder } from "../src/pricing.js";
import { loadPriceList, pricingConfig } from "./helpers.js";

const priceList = loadPriceList();

describe("discountPercentFor", () => {
  it.each([
    [4_999.99, 0],
    [5_000, 3],
    [25_170, 5],
    [50_000, 8],
  ])("subtotal %d -> %d%%", (subtotal, expected) => {
    expect(discountPercentFor(subtotal, pricingConfig)).toBe(expected);
  });

  it("never exceeds the configured maximum", () => {
    const cfg = { maxDiscountPercent: 4, discountTiers: [{ minSubtotal: 0, percent: 30 }] };
    expect(discountPercentFor(100, cfg)).toBe(4);
  });
});

describe("priceOrder", () => {
  it("prices the order-ok sample from the price list", () => {
    const result = priceOrder(
      [
        { sku: "CHR-ERG-01", quantity: 12 },
        { sku: "DSK-ADJ-140", quantity: 6 },
        { sku: "MON-ARM-02", quantity: 12 },
      ],
      priceList,
      pricingConfig,
    );
    expect(result).toEqual({
      ok: true,
      offer: {
        currency: "PLN",
        lines: [
          { sku: "CHR-ERG-01", name: "Ergonomic office chair", quantity: 12, unitPrice: 899, lineTotal: 10788 },
          { sku: "DSK-ADJ-140", name: "Height-adjustable desk 140 cm", quantity: 6, unitPrice: 1899, lineTotal: 11394 },
          { sku: "MON-ARM-02", name: "Dual monitor arm", quantity: 12, unitPrice: 249, lineTotal: 2988 },
        ],
        subtotal: 25170,
        discountPercent: 5,
        discountAmount: 1258.5,
        total: 23911.5,
      },
    });
  });

  it("avoids floating point drift", () => {
    const result = priceOrder(
      [{ sku: "X-1", quantity: 3 }],
      [{ sku: "X-1", name: "Thing", unitPrice: 0.1, currency: "PLN" }],
      pricingConfig,
    );
    expect(result.ok && result.offer.total).toBe(0.3);
  });

  it("rejects unknown SKUs instead of guessing a price", () => {
    const result = priceOrder([{ sku: "FAKE-999", quantity: 1 }], priceList, pricingConfig);
    expect(result).toEqual({ ok: false, code: "UNKNOWN_SKU", error: "Unknown SKU(s): FAKE-999" });
  });

  it("rejects mixed currencies", () => {
    const result = priceOrder(
      [
        { sku: "A-1", quantity: 1 },
        { sku: "B-1", quantity: 1 },
      ],
      [
        { sku: "A-1", name: "A", unitPrice: 1, currency: "PLN" },
        { sku: "B-1", name: "B", unitPrice: 1, currency: "EUR" },
      ],
      pricingConfig,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("MIXED_CURRENCY");
  });
});
