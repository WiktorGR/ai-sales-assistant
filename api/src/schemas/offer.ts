import { z } from "zod";
import { OrderItemSchema } from "./extracted-order.js";

/** One row of the price list sheet. Sheets values arrive as strings, hence coercion. */
export const PriceListEntrySchema = z.object({
  sku: z.string().transform((s) => s.trim().toUpperCase()),
  name: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  currency: z.string().length(3).transform((s) => s.toUpperCase()),
});

export const PriceRequestSchema = z.object({
  items: z.array(OrderItemSchema).min(1).max(50),
  priceList: z.array(PriceListEntrySchema).min(1),
});

export type PriceListEntry = z.infer<typeof PriceListEntrySchema>;
export type PriceRequest = z.infer<typeof PriceRequestSchema>;

export interface OfferLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** Computed by pricing.ts — the only source of numbers in an offer. */
export interface PricedOffer {
  currency: string;
  lines: OfferLine[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
}

/** LLM output of prompts/offer.md: prose only, no numbers it could invent. */
export const OfferTextSchema = z.object({
  subject: z.string().min(1).max(150),
  intro: z.string().min(1).max(1500),
  closing: z.string().min(1).max(800),
});

export type OfferText = z.infer<typeof OfferTextSchema>;
