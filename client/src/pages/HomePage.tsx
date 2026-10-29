import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, IMPORT_ACCEPT, IMPORT_HINT, type DocumentSummary } from "../api";
import { Banner, formatRelative, Icon, Logo, RoleBadge, UserMenu } from "../components/ui";

type Lists = { owned: DocumentSummary[]; shared: DocumentSummary[] };

export function HomePage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .listDocuments()
      .then(setLists)
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function createDoc() {
    setBusy("create");
    setError(null);
    try {
      navigate(`/d/${(await api.createDocument()).id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      navigate(`/d/${(await api.importFile(file)).id}`);
    } catch (err) {
      setError(`Couldn't import "${file.name}": ${(err as Error).message}`);
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function deleteDoc(id: string) {
    try {
      await api.deleteDocument(id);
      setLists((l) => l && { ...l, owned: l.owned.filter((d) => d.id !== id) });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <UserMenu />
      </header>

      <main className="home">
        <section className="home-actions">
          <div>
            <h1>Documents</h1>
            <p className="muted">Create a document, or import one to keep editing it here.</p>
          </div>
          <div className="home-buttons">
            <button className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null} title={IMPORT_HINT}>
              <Icon name="upload" size={16} />
              {busy === "import" ? "Importing…" : "Import file"}
            </button>
            <button className="btn btn-primary" onClick={createDoc} disabled={busy !== null}>
              <Icon name="plus" size={16} />
              {busy === "create" ? "Creating…" : "New document"}
            </button>
            <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
        </section>
        <p className="import-hint muted small">
          <Icon name="upload" size={13} /> Import turns a file into a new editable document. {IMPORT_HINT}.
        </p>

        {error && <Banner tone="error">{error}</Banner>}

        {!lists && !error && <p className="muted">Loading documents…</p>}
        {lists && (
          <>
            <DocSection
              title="My documents"
              docs={lists.owned}
              empty="You haven't created any documents yet. Start with “New document”."
              onDelete={deleteDoc}
            />
            <DocSection
              title="Shared with me"
              docs={lists.shared}
              empty="Nothing has been shared with you yet. Documents others share with you will appear here."
              showOwner
            />
          </>
        )}
      </main>
    </div>
  );
}

function DocSection(props: {
  title: string;
  docs: DocumentSummary[];
  empty: string;
  showOwner?: boolean;
  onDelete?: (id: string) => void;
}) {
  return (
    <section className="doc-section">
      <h2>
        {props.title} <span className="count">{props.docs.length}</span>
      </h2>
      {props.docs.length === 0 ? (
        <p className="empty">{props.empty}</p>
      ) : (
        <ul className="doc-list">
          {props.docs.map((doc) => (
            <DocRow key={doc.id} doc={doc} showOwner={props.showOwner} onDelete={props.onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DocRow({ doc, showOwner, onDelete }: { doc: DocumentSummary; showOwner?: boolean; onDelete?: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="doc-row">
      <Link to={`/d/${doc.id}`} className="doc-link">
        <span className="doc-icon">
          <Icon name="doc" size={18} />
        </span>
        <span className="doc-title">{doc.title}</span>
        {showOwner && <span className="doc-owner muted">Shared by {doc.owner.name}</span>}
        {doc.role !== "owner" && <RoleBadge role={doc.role} />}
        <span className="doc-updated muted">{formatRelative(doc.updatedAt)}</span>
      </Link>
      {onDelete &&
        (confirming ? (
          <span className="confirm">
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(doc.id)}>
              Delete
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="icon-btn" aria-label={`Delete ${doc.title}`} title="Delete" onClick={() => setConfirming(true)}>
            <Icon name="trash" size={16} />
          </button>
        ))}
    </li>
  );
}
