import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { priceOrder } from "../pricing.js";
import { PriceRequestSchema } from "../schemas/index.js";
import { err } from "../result.js";

export async function priceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/price", async (req) => {
    const body = PriceRequestSchema.safeParse(req.body);
    if (!body.success) return err("BAD_REQUEST", z.prettifyError(body.error));

    return priceOrder(body.data.items, body.data.priceList, config.pricing);
  });
}
