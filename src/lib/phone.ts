/**
 * Normalize a Philippine mobile number. Accepts common formatting
 * (spaces, dashes, dots, parentheses) for 09xxxxxxxxx, +639xxxxxxxxx, 639xxxxxxxxx.
 * Returns the canonical "09xxxxxxxxx" form, or null if invalid.
 */
export function normalizePhMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().replace(/[\s\-.()]/g, "");
  let m = /^\+?639(\d{9})$/.exec(s);
  if (m) return `09${m[1]}`;
  m = /^09(\d{9})$/.exec(s);
  if (m) return `09${m[1]}`;
  return null;
}

/** Digits-only tel: link target for a stored number. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
