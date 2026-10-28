import type { Email, ExtractedOrder } from "./schemas/index.js";

export type GuardCode =
  | "INSTRUCTION_OVERRIDE"
  | "DELIMITER_ESCAPE"
  | "DATA_EXFILTRATION"
  | "EXCESSIVE_DISCOUNT"
  | "HIDDEN_CHARACTERS"
  | "SUSPICIOUS_QUANTITY"
  | "SENDER_MISMATCH";

export interface GuardReason {
  code: GuardCode;
  severity: "high" | "low";
  detail: string;
}

export interface GuardResult {
  /** true → manual review, no offer is generated */
  flagged: boolean;
  reasons: GuardReason[];
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const HAS_ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/;

/** Lowercase, strip diacritics and zero-width chars so obfuscated keywords still match. */
export function normalize(text: string): string {
  return text
    .replace(ZERO_WIDTH, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u0142/g, "l")
    .replace(/\s+/g, " ");
}

const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|any)\b.{0,40}\b(instructions?|rules?|prompts?|guidelines|directives)\b/,
  /\b(zignoruj|ignoruj|pomin|zapomnij)\b.{0,40}\b(poprzedni\w*|wczesniejsz\w*|wszystk\w*|swoje|twoje)\b.{0,40}\b(instrukcj\w*|polecen\w*|zasad\w*|regul\w*)/,
  /\b(you are now|from now on you|new instructions|nowe instrukcje|jestes teraz|od teraz jestes)\b/,
  /\b(system prompt|developer mode|jailbreak|prompt systemowy)\b/,
  /<\/?(system|assistant|instructions?)>/,
];

// Fake chat turns ("System: ..."). Checked per line, since normalize() joins lines.
const ROLE_MARKER = /^\s*(system|assistant|asystent|user)\s*:/im;

const EXFILTRATION_PATTERNS: RegExp[] = [
  /\b(other|all|another|previous)\b.{0,30}\b(customers?|clients?)\b.{0,40}\b(data|details|list|emails?|contacts?|addresses|orders|prices|offers)\b/,
  /\b(list|export|send|share)\b.{0,30}\b(all|every)\b.{0,20}\b(customers?|clients?|contacts?)\b/,
  /\b(dane|liste|adresy|zamowienia|kontakty)\b.{0,30}\b(innych|wszystkich|pozostalych)\b.{0,10}\bklient\w*/,
  /\b(api key|password|credentials|access token|haslo|klucz api)\b/,
];

const DISCOUNT_WORDS = /\b(discount|rabat\w*|upust\w*|off|znizk\w*)\b/;
const FREE_PATTERNS = /\b(free of charge|for free|at no cost|za darmo|gratis|bezplatnie)\b/;

function findExcessiveDiscount(text: string, maxPercent: number): string | null {
  for (const match of text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)) {
    const pct = Number((match[1] ?? "0").replace(",", "."));
    const start = match.index ?? 0;
    const context = text.slice(Math.max(0, start - 60), start + match[0].length + 60);
    if (pct > maxPercent && DISCOUNT_WORDS.test(context)) {
      return `${pct}% discount requested (max ${maxPercent}%)`;
    }
  }
  if (FREE_PATTERNS.test(text)) return "Request for goods free of charge";
  return null;
}

const firstMatch = (patterns: RegExp[], text: string): RegExpMatchArray | null => {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
};

const snippet = (m: RegExpMatchArray): string => `matched "${m[0].trim().slice(0, 60)}"`;

export function checkEmail(email: Email, maxDiscountPercent: number): GuardReason[] {
  const raw = `${email.subject}\n${email.body}`;
  const text = normalize(raw);
  const reasons: GuardReason[] = [];

  const override = firstMatch(INSTRUCTION_PATTERNS, text) ?? raw.replace(ZERO_WIDTH, "").match(ROLE_MARKER);
  if (override) {
    reasons.push({ code: "INSTRUCTION_OVERRIDE", severity: "high", detail: snippet(override) });
  }
  if (/<\/?\s*email\s*>/.test(text)) {
    reasons.push({ code: "DELIMITER_ESCAPE", severity: "high", detail: "Email contains <email> delimiter tags" });
  }
  const exfil = firstMatch(EXFILTRATION_PATTERNS, text);
  if (exfil) {
    reasons.push({ code: "DATA_EXFILTRATION", severity: "high", detail: snippet(exfil) });
  }
  const discount = findExcessiveDiscount(text, maxDiscountPercent);
  if (discount) {
    reasons.push({ code: "EXCESSIVE_DISCOUNT", severity: "high", detail: discount });
  }
  if (HAS_ZERO_WIDTH.test(raw)) {
    reasons.push({ code: "HIDDEN_CHARACTERS", severity: "low", detail: "Zero-width characters in email" });
  }
  return reasons;
}

/** Extracts the bare address from "Jane Doe <jane@acme.com>". */
export function senderAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

export function checkExtraction(
  email: Email,
  order: ExtractedOrder,
  maxDiscountPercent: number,
): GuardReason[] {
  const reasons: GuardReason[] = [];

  if (order.requestedDiscountPercent !== null && order.requestedDiscountPercent > maxDiscountPercent) {
    reasons.push({
      code: "EXCESSIVE_DISCOUNT",
      severity: "high",
      detail: `${order.requestedDiscountPercent}% discount requested (max ${maxDiscountPercent}%)`,
    });
  }
  const huge = order.items.find((i) => i.quantity > 10_000);
  if (huge) {
    reasons.push({ code: "SUSPICIOUS_QUANTITY", severity: "high", detail: `${huge.quantity} x ${huge.sku}` });
  }
  if (order.customer.email.toLowerCase() !== senderAddress(email.from)) {
    // Common when someone orders on behalf of a colleague, so only a warning.
    reasons.push({ code: "SENDER_MISMATCH", severity: "low", detail: "Extracted email differs from sender" });
  }
  return reasons;
}

export function runGuards(
  email: Email,
  order: ExtractedOrder | undefined,
  maxDiscountPercent: number,
): GuardResult {
  const reasons = [
    ...checkEmail(email, maxDiscountPercent),
    ...(order ? checkExtraction(email, order, maxDiscountPercent) : []),
  ];
  return { flagged: reasons.some((r) => r.severity === "high"), reasons };
}
