import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type DocumentDetail, type Role } from "../api";
import { useUser } from "../auth";
import { ShareDialog } from "../components/ShareDialog";
import { Toolbar } from "../components/Toolbar";
import { Banner, formatRelative, Icon, RoleBadge, UserMenu } from "../components/ui";
import { useDocumentSaver, type SaveStatus } from "../useDocumentSaver";
import { NotFound } from "./NotFound";

const POLL_INTERVAL_MS = 4000;

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    api.getDocument(id!).then(setDoc).catch(setError);
  }, [id]);

  if (error?.status === 404) return <NotFound message="This document doesn't exist, or it hasn't been shared with you." />;
  if (error) return <NotFound message={error.message} />;
  if (!doc || doc.id !== id) return <div className="splash" />;
  return <DocumentEditor key={doc.id} initial={doc} />;
}

function DocumentEditor({ initial }: { initial: DocumentDetail }) {
  const me = useUser();
  const [title, setTitle] = useState(initial.title);
  const [role, setRole] = useState<Role>(initial.role);
  const [meta, setMeta] = useState({ updatedAt: initial.updatedAt, updatedBy: initial.updatedBy });
  const [notice, setNotice] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canEdit = (role === "owner" || role === "editor") && !accessLost;

  const saver = useDocumentSaver(initial.id, initial.version, (saved) =>
    setMeta({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }),
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: initial.contentHtml,
    editable: canEdit,
    onUpdate: ({ editor }) => {
      if (editor.isEditable) saver.queue({ contentHtml: editor.getHTML() });
    },
  });

  useEffect(() => {
    // emitUpdate=false: toggling editability must not look like a content edit (and trigger a save)
    editor.setEditable(canEdit, false);
  }, [editor, canEdit]);

  // Cmd/Ctrl+S saves immediately instead of opening the browser's save dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saver.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saver.flush]);

  // Lightweight collaboration: poll for newer versions saved by others and pull them in
  // when we have nothing unsaved locally. Concurrent edits are caught by the 409 path.
  useEffect(() => {
    const applyRemote = (latest: DocumentDetail) => {
      setRole(latest.role);
      if (!saver.acceptRemote(latest)) return;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(latest.contentHtml, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      setTitle(latest.title);
      setMeta({ updatedAt: latest.updatedAt, updatedBy: latest.updatedBy });
      setNotice(latest.updatedBy && latest.updatedBy !== me.name ? `Updated with ${latest.updatedBy}'s latest changes` : "Updated with the latest version");
    };
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      api
        .getDocument(initial.id)
        .then(applyRemote)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) setAccessLost(true);
        });
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [editor, initial.id, me.name, saver.acceptRemote]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    saver.queue({ title: value });
  };

  const resolveConflict = async (keep: "mine" | "theirs") => {
    try {
      if (keep === "mine") return await saver.overwrite();
      const latest = await saver.discard();
      editor.commands.setContent(latest.contentHtml, { emitUpdate: false });
      setTitle(latest.title);
      setMeta({ updatedAt: latest.updatedAt, updatedBy: latest.updatedBy });
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  return (
    <div className="app doc-app">
      <header className="topbar doc-topbar">
        <Link to="/" className="icon-btn" aria-label="Back to documents" title="Back to documents" onClick={() => void saver.flush()}>
          <Icon name="back" />
        </Link>
        <div className="doc-heading">
          <input
            className="title-input"
            aria-label="Document title"
            value={title}
            maxLength={200}
            readOnly={!canEdit}
            placeholder="Untitled document"
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => !title.trim() && canEdit && onTitleChange("Untitled document")}
            onKeyDown={(e) => e.key === "Enter" && editor.commands.focus("start")}
          />
          <div className="doc-meta muted small">
            {role === "owner" ? "Owned by you" : `Owned by ${initial.owner.name}`}
            {meta.updatedBy && ` · Last edited by ${meta.updatedBy === me.name ? "you" : meta.updatedBy} ${formatRelative(meta.updatedAt)}`}
          </div>
        </div>
        <div className="doc-actions">
          {canEdit && <SaveIndicator status={saver.status} onRetry={saver.flush} />}
          {role === "owner" ? (
            <button className="btn btn-primary" onClick={() => setSharing(true)}>
              <Icon name="share" size={16} /> Share
            </button>
          ) : (
            <RoleBadge role={role} />
          )}
          <UserMenu />
        </div>
      </header>

      {/* Toolbar and banners stay pinned under the header so conflicts are never scrolled out of view */}
      <div className="doc-sticky">
        {canEdit && <Toolbar editor={editor} />}
        <div className="doc-banners">
        {accessLost && <Banner tone="error">Your access to this document was removed by the owner.</Banner>}
        {!accessLost && role === "viewer" && (
          <Banner tone="info">You have view-only access. Ask {initial.owner.name} for edit access.</Banner>
        )}
        {saver.status === "conflict" && (
          <Banner tone="warning">
            Someone else saved changes while you were editing, so your latest edits weren't saved.
            <span className="banner-actions">
              <button className="btn btn-sm btn-secondary" onClick={() => resolveConflict("theirs")}>
                Load their version
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => resolveConflict("mine")}>
                Keep mine
              </button>
            </span>
          </Banner>
        )}
        {saver.status === "error" && saver.error && <Banner tone="error">Couldn't save: {saver.error}</Banner>}
        </div>
      </div>

      <main className="page-scroll">
        <article className={`page${canEdit ? "" : " is-readonly"}`}>
          <EditorContent editor={editor} className="editor" />
        </article>
      </main>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {sharing && <ShareDialog docId={initial.id} title={title} owner={initial.owner} onClose={() => setSharing(false)} />}
    </div>
  );
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
  conflict: "Not saved",
};

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span className={`save-status save-${status}`} aria-live="polite">
      <span className="dot" />
      {STATUS_TEXT[status]}
      {status === "error" && (
        <button className="link-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  );
}
