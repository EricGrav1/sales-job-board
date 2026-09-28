import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageContainer } from "../components/Layout";
import { Alert, Card } from "../components/ui";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get("token");
  const [state, setState] = useState<"verifying" | "verified" | "failed">(token ? "verifying" : "failed");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; only submit the token once.
    if (!token || started.current) {
      return;
    }
    started.current = true;
    apiRequest("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) })
      .then(async () => {
        setState("verified");
        await refresh();
      })
      .catch(() => setState("failed"));
  }, [token, refresh]);

  return (
    <PageContainer narrow>
      <Card>
        <h1 className="text-2xl font-semibold">Verify email</h1>
        <div className="mt-4">
          {state === "verifying" ? <p className="text-sm text-slate-600">Verifying…</p> : null}
          {state === "verified" ? (
            <Alert tone="success">
              Your email is verified.{" "}
              <Link to="/login" className="font-semibold underline">
                Log in to continue
              </Link>
            </Alert>
          ) : null}
          {state === "failed" ? <Alert>This verification link is invalid or has expired.</Alert> : null}
        </div>
      </Card>
    </PageContainer>
  );
}
