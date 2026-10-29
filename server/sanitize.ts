import sanitizeHtml from "sanitize-html";

/**
 * The single allowlist for stored document HTML. It mirrors what the editor schema can
 * represent, so imported files and API writes can never smuggle in scripts, styles or
 * event handlers, and what is stored is what the editor will render.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h1", "h2", "h3", "strong", "em", "u", "s",
    "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a",
  ],
  allowedAttributes: { a: ["href"], ol: ["start"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    // mammoth wraps some runs in <div>s; treat them as paragraphs
    div: "p",
  },
  // Drop the contents of dangerous elements entirely instead of unwrapping their text
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "title"],
};

export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
