import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PriceListEntrySchema, type Email, type ExtractedOrder, type PriceListEntry } from "../src/schemas/index.js";

const samplesDir = fileURLToPath(new URL("../../samples/", import.meta.url));

/** Parses a samples/*.txt file: "Header: value" lines, blank line, body. */
export function loadSample(name: string): Email {
  const raw = readFileSync(samplesDir + name, "utf8");
  const [head = "", ...rest] = raw.split(/\r?\n\r?\n/);
  const header = (key: string): string =>
    head.match(new RegExp(`^${key}:\\s*(.*)$`, "mi"))?.[1]?.trim() ?? "";
  return { messageId: name, from: header("From"), subject: header("Subject"), body: rest.join("\n\n") };
}

export function loadPriceList(): PriceListEntry[] {
  const [, ...rows] = readFileSync(samplesDir + "price-list.csv", "utf8").trim().split("\n");
  return rows.map((row) => {
    const [sku, name, unitPrice, currency] = row.split(",");
    return PriceListEntrySchema.parse({ sku, name, unitPrice, currency });
  });
}

export const pricingConfig = {
  maxDiscountPercent: 10,
  discountTiers: [
    { minSubtotal: 5_000, percent: 3 },
    { minSubtotal: 20_000, percent: 5 },
    { minSubtotal: 50_000, percent: 8 },
  ],
};

export function extraction(overrides: Partial<ExtractedOrder> = {}): ExtractedOrder {
  return {
    customer: {
      firstName: "Anna",
      lastName: "Kowalska",
      email: "anna.kowalska@brightlabs.example",
      phone: null,
      company: "BrightLabs Sp. z o.o.",
    },
    items: [{ sku: "CHR-ERG-01", quantity: 12 }],
    requestedDeliveryDate: null,
    requestedDiscountPercent: null,
    orderReference: null,
    notes: null,
    ...overrides,
  };
}
