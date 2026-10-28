import { z } from "zod";

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

export const OrderItemSchema = z.object({
  sku: z.string().transform((s) => s.trim().toUpperCase()).pipe(z.string().regex(SKU_PATTERN)),
  quantity: z.number().int().positive().max(100_000),
});

/** LLM output of prompts/extract.md. The LLM picks products and quantities only — never prices. */
export const ExtractedOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().max(100).nullable(),
    lastName: z.string().max(100).nullable(),
    email: z.email(),
    phone: z.string().max(40).nullable(),
    company: z.string().max(200).nullable(),
  }),
  items: z.array(OrderItemSchema).max(50),
  requestedDeliveryDate: z.iso.date().nullable(),
  // What the customer asked for. Informational only: pricing.ts decides the actual discount.
  requestedDiscountPercent: z.number().min(0).max(100).nullable(),
  orderReference: z.string().max(100).nullable(),
  notes: z.string().max(1000).nullable(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type ExtractedOrder = z.infer<typeof ExtractedOrderSchema>;
