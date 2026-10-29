import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { Icon } from "../components/ui";

const DEMO_PASSWORD = "ajaia-demo";
const DEMO_ACCOUNTS = [
  { name: "Alice Chen", email: "alice@ajaia.test" },
  { name: "Bob Rivera", email: "bob@ajaia.test" },
  { name: "Carol Okafor", email: "carol@ajaia.test" },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await login(e, p);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    void signIn(email, password);
  };

  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">
          <span className="logo-mark logo-mark-lg">
            <Icon name="doc" size={24} />
          </span>
          <h1>
            Ajaia <span>Docs</span>
          </h1>
          <p>Write, format and share documents with your team.</p>
        </div>

        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="demo-accounts">
          <p>
            <strong>Demo accounts</strong> · password <code>{DEMO_PASSWORD}</code>
          </p>
          <div className="demo-grid">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} className="demo-account" disabled={busy} onClick={() => signIn(a.email, DEMO_PASSWORD)}>
                <span className="avatar">{a.name[0]}</span>
                <span>
                  <strong>{a.name.split(" ")[0]}</strong>
                  <small>{a.email}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">Open a second browser (or a private window) as another user to try sharing.</p>
        </div>
      </div>
    </main>
  );
}
