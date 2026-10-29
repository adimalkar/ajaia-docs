import path from "node:path";
import mammoth from "mammoth";
import { marked } from "marked";
import { HttpError } from "./errors.js";
import { sanitizeDocumentHtml } from "./sanitize.js";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Blank lines separate paragraphs; single newlines become line breaks. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, " ").trim();
  return (base || "Imported document").slice(0, 200);
}

/** Converts an uploaded file to sanitized editor HTML. Throws HttpError for unsupported or unreadable files. */
export async function fileToHtml(filename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  let html: string;
  switch (ext) {
    case ".txt":
      html = textToHtml(buffer.toString("utf8"));
      break;
    case ".md":
    case ".markdown":
      html = await marked.parse(buffer.toString("utf8"), { gfm: true });
      break;
    case ".docx":
      try {
        html = (await mammoth.convertToHtml({ buffer })).value;
      } catch {
        throw new HttpError(422, "We couldn't read that .docx file. Is it a valid Word document?");
      }
      break;
    default:
      throw new HttpError(
        415,
        `Unsupported file type "${ext || "(none)"}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      );
  }
  return sanitizeDocumentHtml(html);
}
