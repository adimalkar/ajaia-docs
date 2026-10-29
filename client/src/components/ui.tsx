import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Role } from "../api";
import { useAuth } from "../auth";

const ICONS = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  bulletList: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  orderedList: "M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
  quote: "M6 17h3l2-4V7H5v6h3M14 17h3l2-4V7h-6v6h3",
  clear: "M4 7V4h16v3M9 20h6M12 4v16M3 3l18 18",
  share: "M16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  back: "M15 18l-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  close: "M18 6 6 18M6 6l12 12",
  doc: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6",
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Ajaia Docs home">
      <span className="logo-mark">
        <Icon name="doc" size={18} />
      </span>
      <span className="logo-text">
        Ajaia <span>Docs</span>
      </span>
    </Link>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <div className="user-menu">
      <span className="avatar" title={user.email}>
        {initials}
      </span>
      <span className="user-name">{user.name}</span>
      <button className="btn btn-ghost btn-sm" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "View only" };

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge badge-${role}`}>{ROLE_LABEL[role]}</span>;
}

export function Banner({ tone, children }: { tone: "info" | "warning" | "error"; children: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "info" ? "status" : "alert"}>
      {children}
    </div>
  );
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
