import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ClassificationSchema, ExtractedOrderSchema, OfferTextSchema } from "../schemas/index.js";
import { err, type Result } from "../result.js";

const schemas = {
  classification: ClassificationSchema,
  extraction: ExtractedOrderSchema,
  offerText: OfferTextSchema,
} as const;

const ValidateBody = z.object({
  schema: z.enum(["classification", "extraction", "offerText"]),
  // Raw LLM output: either already parsed JSON or a string (possibly wrapped in ```json fences).
  data: z.unknown(),
});

export function parseLlmJson(data: unknown): Result<{ value: unknown }> {
  if (typeof data !== "string") return { ok: true, value: data };
  const stripped = data
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch {
    return err("INVALID_JSON", "LLM output is not valid JSON");
  }
}

export async function validateRoutes(app: FastifyInstance): Promise<void> {
  app.post("/validate", async (req) => {
    const body = ValidateBody.safeParse(req.body);
    if (!body.success) return err("BAD_REQUEST", z.prettifyError(body.error));

    const parsed = parseLlmJson(body.data.data);
    if (!parsed.ok) return parsed;

    const result = schemas[body.data.schema].safeParse(parsed.value);
    if (!result.success) return err("SCHEMA_MISMATCH", z.prettifyError(result.error));

    return { ok: true, data: result.data };
  });
}
