/**
 * Sanitise a post-login `?next=` value (#40). Only a same-origin relative path
 * ("/account", "/search?q=x") is returned; absolute URLs, protocol-relative
 * "//host", backslash tricks ("/\host") and their percent-encoded forms fall
 * back, so the login page can't be used to bounce users to another site.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/account",
): string {
  if (!next) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }

  for (const v of [next, decoded]) {
    if (!v.startsWith("/") || v.startsWith("//")) return fallback;
    if (v.includes("\\")) return fallback;
    // Browsers strip tabs/newlines inside URLs, so "/\t/host" becomes "//host".
    if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;
  }

  // Final check with the URL parser: the path must resolve to our own origin.
  const base = "http://same-origin.invalid";
  try {
    if (new URL(next, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
