import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  MAX_DISCOUNT_PERCENT: z.coerce.number().min(0).max(50).default(10),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export interface DiscountTier {
  minSubtotal: number;
  percent: number;
}

export interface PricingConfig {
  maxDiscountPercent: number;
  /** Volume discounts by order subtotal, highest threshold wins. */
  discountTiers: DiscountTier[];
}

const env = EnvSchema.parse(process.env);

export const config = {
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  pricing: {
    maxDiscountPercent: env.MAX_DISCOUNT_PERCENT,
    discountTiers: [
      { minSubtotal: 5_000, percent: 3 },
      { minSubtotal: 20_000, percent: 5 },
      { minSubtotal: 50_000, percent: 8 },
    ],
  } satisfies PricingConfig,
};
