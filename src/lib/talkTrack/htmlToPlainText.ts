/**
 * ClearMAP returns some talk-track blurbs as rich-text HTML (e.g. `<ul><li><p><strong>…`).
 * The Talk Track tab displays/edits these as plain text, so raw markup leaks into the UI
 * (see CLEARGO-I-21). Convert the markup into clean, readable text: list items become bullet
 * lines, block/break tags become newlines, and common HTML entities are decoded.
 */
export function htmlToPlainText(input: string): string {
  if (!input || typeof input !== "string") return "";
  // Fast path: nothing to normalize.
  if (!/<[^>]+>|&[a-z#0-9]+;/i.test(input)) return input.trim();
  const withBreaks = input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|tr|td|th|li|ul|ol|h[1-6]|section|article|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return decoded
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}
