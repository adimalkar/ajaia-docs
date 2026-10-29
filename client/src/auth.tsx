import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type User } from "./api";

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, fallback, signedOut }: { children: ReactNode; fallback: ReactNode; signedOut: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
        setUser(null);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser((await api.login(email, password)).user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  if (user === undefined) return <>{fallback}</>;
  return (
    <AuthContext.Provider value={{ user, login, logout }}>{user ? children : signedOut}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** For screens that only render when signed in. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called while signed out");
  return user;
}
