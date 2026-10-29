import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { DB } from "../db.js";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listShares,
  revokeShare,
  shareDocument,
  updateDocument,
} from "../documents.js";
import { HttpError } from "../errors.js";
import { fileToHtml, MAX_UPLOAD_BYTES, titleFromFilename } from "../importers.js";
import { sanitizeDocumentHtml } from "../sanitize.js";

const DEFAULT_TITLE = "Untitled document";

const title = z
  .string()
  .trim()
  .max(200, "Title must be 200 characters or fewer")
  .transform((t) => t || DEFAULT_TITLE);

const createBody = z.object({ title: title.optional() });

const updateBody = z
  .object({
    title: title.optional(),
    contentHtml: z.string().max(1_000_000, "Document is too large").optional(),
    baseVersion: z.number().int().positive(),
  })
  .refine((b) => b.title !== undefined || b.contentHtml !== undefined, "Nothing to update");

const shareBody = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["viewer", "editor"]),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

export function documentRoutes(db: DB) {
  const router = Router();

  router.get("/", async (req, res) => {
    res.json(await listDocuments(db, req.user!.id));
  });

  router.post("/", async (req, res) => {
    const body = createBody.parse(req.body ?? {});
    res.status(201).json(await createDocument(db, req.user!.id, body.title ?? DEFAULT_TITLE));
  });

  // Upload a .txt / .md / .docx file and turn it into a new editable document.
  router.post("/import", upload.single("file"), async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose a file to import");
    // multer decodes multipart filenames as latin1; recover UTF-8 names
    const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const html = await fileToHtml(filename, req.file.buffer);
    res.status(201).json(await createDocument(db, req.user!.id, titleFromFilename(filename), html));
  });

  router.get("/:id", async (req, res) => {
    res.json(await getDocument(db, req.params.id, req.user!.id));
  });

  router.patch("/:id", async (req, res) => {
    const body = updateBody.parse(req.body);
    const contentHtml = body.contentHtml === undefined ? undefined : sanitizeDocumentHtml(body.contentHtml);
    res.json(await updateDocument(db, req.params.id, req.user!.id, { ...body, contentHtml }));
  });

  router.delete("/:id", async (req, res) => {
    await deleteDocument(db, req.params.id, req.user!.id);
    res.status(204).end();
  });

  router.get("/:id/shares", async (req, res) => {
    res.json({ shares: await listShares(db, req.params.id, req.user!.id) });
  });

  router.post("/:id/shares", async (req, res) => {
    const { email, role } = shareBody.parse(req.body);
    res.json({ shares: await shareDocument(db, req.params.id, req.user!.id, email, role) });
  });

  router.delete("/:id/shares/:userId", async (req, res) => {
    const userId = z.coerce.number().int().parse(req.params.userId);
    res.json({ shares: await revokeShare(db, req.params.id, req.user!.id, userId) });
  });

  return router;
}
