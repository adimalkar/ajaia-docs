import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "Document not found");

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".");
    res.status(400).json({ error: field ? `${field}: ${first.message}` : first?.message ?? "Invalid request" });
    return;
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)" : err.message;
    res.status(status).json({ error: message });
    return;
  }
  // body-parser errors (malformed JSON, payload too large) carry a status
  if (typeof err?.status === "number" && err.status < 500) {
    res.status(err.status).json({ error: err.expose ? err.message : "Bad request" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side" });
};
