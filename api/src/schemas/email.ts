import { z } from "zod";

/** Raw inbound email as passed from the n8n Gmail trigger. Content is untrusted. */
export const EmailSchema = z.object({
  messageId: z.string().min(1),
  from: z.string().min(1),
  subject: z.string().default(""),
  body: z.string().max(50_000),
});

export type Email = z.infer<typeof EmailSchema>;
