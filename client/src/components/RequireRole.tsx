import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type UserRole } from "../lib/auth";
import { PageContainer } from "./Layout";
import { Alert } from "./ui";

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageContainer>Loading…</PageContainer>;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (!roles.includes(user.role)) {
    return (
      <PageContainer narrow>
        <Alert>This page isn’t available for your account type.</Alert>
      </PageContainer>
    );
  }

  if (!user.emailVerifiedAt) {
    return (
      <PageContainer narrow>
        <Alert tone="info">Check your inbox and verify your email to continue.</Alert>
      </PageContainer>
    );
  }

  return <>{children}</>;
}
