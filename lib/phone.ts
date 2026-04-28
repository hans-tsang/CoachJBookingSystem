/**
 * Normalize a phone / WhatsApp number to digits only.
 * Strips spaces, dashes, parentheses, plus signs, and any other punctuation.
 */
export function normalizePhone(input: string): string {
  return (input ?? "").replace(/\D+/g, "");
}

/** Compare two phone numbers after normalization. */
export function phonesEqual(a: string, b: string): boolean {
  return normalizePhone(a) === normalizePhone(b) && normalizePhone(a).length > 0;
}
