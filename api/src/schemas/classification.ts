import { z } from "zod";

export const EmailCategory = z.enum(["order", "inquiry", "complaint", "other"]);

/** LLM output of prompts/classify.md */
export const ClassificationSchema = z.object({
  category: EmailCategory,
  confidence: z.number().min(0).max(1),
  language: z.string().min(2).max(5),
  summary: z.string().max(300),
});

export type Classification = z.infer<typeof ClassificationSchema>;
