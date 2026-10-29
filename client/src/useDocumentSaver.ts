import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type DocumentDetail } from "./api";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

type Changes = { title?: string; contentHtml?: string };

const AUTOSAVE_DELAY_MS = 800;

/**
 * Serialized autosave queue for one document.
 *
 * Edits are merged into a single pending patch and flushed after a short pause. Only one
 * request is in flight at a time, each carrying the version it was based on, so the server
 * can reject (409) a write that would clobber someone else's newer save.
 */
export function useDocumentSaver(docId: string, initialVersion: number, onSaved: (doc: DocumentDetail) => void) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const version = useRef(initialVersion);
  const pending = useRef<Changes | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const blocked = useRef(false); // stop auto-flushing while a conflict is unresolved
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || blocked.current || !pending.current) return;
    const changes = pending.current;
    pending.current = null;
    inFlight.current = true;
    setStatus("saving");
    try {
      const saved = await api.updateDocument(docId, { ...changes, baseVersion: version.current });
      version.current = saved.version;
      onSavedRef.current(saved);
      setError(null);
    } catch (err) {
      // Put the unsaved changes back underneath anything typed since
      const typedSince = pending.current as Changes | null;
      pending.current = { ...changes, ...typedSince };
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        blocked.current = true;
        setStatus("conflict");
      } else {
        setError((err as Error).message);
        setStatus("error");
      }
      return;
    } finally {
      inFlight.current = false;
    }
    if (pending.current) void flush();
    else setStatus("saved");
  }, [docId]);

  const queue = useCallback(
    (changes: Changes) => {
      pending.current = { ...pending.current, ...changes };
      if (blocked.current) return;
      setStatus("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  /** Conflict resolution: write our pending changes on top of the latest server version. */
  const overwrite = useCallback(async () => {
    const latest = await api.getDocument(docId);
    version.current = latest.version;
    blocked.current = false;
    await flush();
  }, [docId, flush]);

  /** Conflict resolution: drop our pending changes and adopt the server version. */
  const discard = useCallback(async () => {
    const latest = await api.getDocument(docId);
    pending.current = null;
    version.current = latest.version;
    blocked.current = false;
    setStatus("saved");
    return latest;
  }, [docId]);

  /** Adopt a newer version fetched by polling, but only when nothing local is unsaved. */
  const acceptRemote = useCallback((doc: DocumentDetail) => {
    if (pending.current || inFlight.current || blocked.current || doc.version <= version.current) return false;
    version.current = doc.version;
    return true;
  }, []);

  const hasUnsaved = () => pending.current !== null || inFlight.current;

  // Warn before closing the tab with unsaved work; try to flush on route change.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
  }, [flush]);

  return { status, error, queue, flush, overwrite, discard, acceptRemote, hasUnsaved };
}
