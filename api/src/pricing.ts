import type { PricingConfig } from "./config.js";
import type { OrderItem, PriceListEntry, PricedOffer, OfferLine } from "./schemas/index.js";
import { err, type Result } from "./result.js";

// All arithmetic in integer cents to avoid floating point drift.
const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;

export function discountPercentFor(subtotal: number, cfg: PricingConfig): number {
  const tier = [...cfg.discountTiers]
    .sort((a, b) => b.minSubtotal - a.minSubtotal)
    .find((t) => subtotal >= t.minSubtotal);
  return Math.min(tier?.percent ?? 0, cfg.maxDiscountPercent);
}

/**
 * Prices an order against the price list. The customer's requested discount is
 * deliberately not an input: discounts come from config only.
 */
export function priceOrder(
  items: OrderItem[],
  priceList: PriceListEntry[],
  cfg: PricingConfig,
): Result<{ offer: PricedOffer }> {
  const bySku = new Map(priceList.map((p) => [p.sku, p]));

  const unknown = items.filter((i) => !bySku.has(i.sku)).map((i) => i.sku);
  if (unknown.length > 0) {
    return err("UNKNOWN_SKU", `Unknown SKU(s): ${unknown.join(", ")}`);
  }

  const currencies = new Set(items.map((i) => bySku.get(i.sku)?.currency));
  if (currencies.size !== 1) {
    return err("MIXED_CURRENCY", "Items are priced in different currencies");
  }
  const [currency] = currencies;

  let subtotalCents = 0;
  const lines: OfferLine[] = items.map((item) => {
    const entry = bySku.get(item.sku) as PriceListEntry;
    const lineCents = toCents(entry.unitPrice) * item.quantity;
    subtotalCents += lineCents;
    return {
      sku: entry.sku,
      name: entry.name,
      quantity: item.quantity,
      unitPrice: fromCents(toCents(entry.unitPrice)),
      lineTotal: fromCents(lineCents),
    };
  });

  const discountPercent = discountPercentFor(fromCents(subtotalCents), cfg);
  const discountCents = Math.round((subtotalCents * discountPercent) / 100);

  return {
    ok: true,
    offer: {
      currency: currency as string,
      lines,
      subtotal: fromCents(subtotalCents),
      discountPercent,
      discountAmount: fromCents(discountCents),
      total: fromCents(subtotalCents - discountCents),
    },
  };
}
