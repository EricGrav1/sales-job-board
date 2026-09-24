import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageContainer } from "../components/Layout";
import { Alert, Button, Card, TextField, readApiError } from "../components/ui";
import { apiRequest } from "../lib/api";
import { useAuth, type SessionUser } from "../lib/auth";

// Only allow same-site relative redirects (prevents open redirects like ?next=//evil.com).
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await apiRequest<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      await refresh();
      navigate(safeNext(searchParams.get("next")) ?? (user.role === "employer" ? "/employer" : "/jobs"));
    } catch (caught) {
      setError(readApiError(caught).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer narrow>
      <Card>
        <h1 className="text-2xl font-semibold">Log in</h1>
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          New here?{" "}
          <Link to="/signup" className="font-semibold text-accent">
            Create an account
          </Link>
        </p>
      </Card>
    </PageContainer>
  );
}
