import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { runGuards } from "../guards.js";
import { EmailSchema, ExtractedOrderSchema } from "../schemas/index.js";
import { err } from "../result.js";

const GuardBody = z.object({
  email: EmailSchema,
  extraction: ExtractedOrderSchema.optional(),
});

export async function guardRoutes(app: FastifyInstance): Promise<void> {
  app.post("/guard", async (req) => {
    const body = GuardBody.safeParse(req.body);
    if (!body.success) return err("BAD_REQUEST", z.prettifyError(body.error));

    const result = runGuards(body.data.email, body.data.extraction, config.pricing.maxDiscountPercent);
    if (result.flagged) {
      // Log codes only — never the email content.
      req.log.warn({ messageId: body.data.email.messageId, codes: result.reasons.map((r) => r.code) }, "email flagged");
    }
    return { ok: true, ...result };
  });
}
