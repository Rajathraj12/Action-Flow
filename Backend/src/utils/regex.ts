/**
 * Safely escapes all special regular expression characters from a string
 * to prevent RegExp injection, syntax errors, and ReDoS attacks.
 */
export function escapeRegex(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
