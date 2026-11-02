import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../services/api.ts";

export type User = { id: string; name: string; email: string; role: "AUCTIONEER" | "BIDDER" };
type AuthContextValue = { user: User | null; loading: boolean; login(email: string, password: string): Promise<void>; logout(): Promise<void>; refresh(): Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(true);
  const refresh = async () => { try { setUser(await api<User>("/auth/me")); } catch { setUser(null); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  const value = useMemo(() => ({ user, loading, refresh, login: async (email: string, password: string) => { setUser(await api<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })); }, logout: async () => { await api("/auth/logout", { method: "POST" }); setUser(null); } }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider ausente"); return value; };
