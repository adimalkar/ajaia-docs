import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Share, type ShareRole, type User } from "../api";
import { Icon } from "./ui";

export function ShareDialog({ docId, title, owner, onClose }: { docId: string; title: string; owner: User; onClose: () => void }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [directory, setDirectory] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    Promise.all([api.listShares(docId), api.users()])
      .then(([s, u]) => {
        setShares(s.shares);
        setDirectory(u.users);
      })
      .catch((err) => setError(err.message));
  }, [docId]);

  async function run(action: () => Promise<{ shares: Share[] }>) {
    setBusy(true);
    setError(null);
    try {
      setShares((await action()).shares);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.share(docId, email, role))) setEmail("");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}/d/${docId}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sharedIds = new Set(shares?.map((s) => s.userId));
  const suggestions = directory.filter((u) => u.id !== owner.id && !sharedIds.has(u.id));

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-header">
          <h2>Share “{title}”</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <form className="share-form" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="Add people by email"
            aria-label="Email address"
            list="share-suggestions"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <datalist id="share-suggestions">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>
                {u.name}
              </option>
            ))}
          </datalist>
          <select aria-label="Access level" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !email}>
            Share
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <h3>People with access</h3>
        <ul className="share-list">
          <li>
            <span className="avatar">{owner.name[0]}</span>
            <span className="share-who">
              <strong>{owner.name}</strong>
              <small>{owner.email}</small>
            </span>
            <span className="muted small">Owner</span>
          </li>
          {shares?.map((s) => (
            <li key={s.userId}>
              <span className="avatar">{s.name[0]}</span>
              <span className="share-who">
                <strong>{s.name}</strong>
                <small>{s.email}</small>
              </span>
              <select
                aria-label={`Access for ${s.name}`}
                value={s.role}
                disabled={busy}
                onChange={(e) => run(() => api.share(docId, s.email, e.target.value as ShareRole))}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="icon-btn" aria-label={`Remove ${s.name}`} title="Remove access" disabled={busy} onClick={() => run(() => api.revokeShare(docId, s.userId))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
          {shares === null && !error && <li className="muted small">Loading…</li>}
        </ul>

        <footer className="dialog-footer">
          <button className="btn btn-secondary" type="button" onClick={copyLink}>
            <Icon name="link" size={16} />
            {copied ? "Link copied" : "Copy link"}
          </button>
          <span className="muted small">Only people listed above can open this link.</span>
        </footer>
      </div>
    </dialog>
  );
}
