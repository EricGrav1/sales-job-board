import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, apiRequest } from "./api";

export type UserRole = "rep" | "employer" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  emailVerifiedAt: string | null;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
  sizeBand: "1-10" | "11-50" | "51-200" | "201-1000" | "1000+" | null;
  plan: "free" | "premium";
  premiumCurrentPeriodEnd: string | null;
  creditBalanceCents: number;
};

type MeResponse = {
  user: SessionUser;
  company: Company | null;
};

type AuthState = {
  loading: boolean;
  user: SessionUser | null;
  company: Company | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await apiRequest<MeResponse>("/api/auth/me");
      setUser(me.user);
      setCompany(me.company);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        console.error(error);
      }
      setUser(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(null);
    setCompany(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ loading, user, company, refresh, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
