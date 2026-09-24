import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageContainer } from "../components/Layout";
import { Alert, Button, Card, TextField, readApiError, type FieldErrors } from "../components/ui";
import { apiRequest } from "../lib/api";

type AccountType = "job_seeker" | "employer";

export function SignupPage() {
  const [searchParams] = useSearchParams();
  const [accountType, setAccountType] = useState<AccountType>(
    searchParams.get("type") === "employer" ? "employer" : "job_seeker"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, accountType })
      });
      setDone(true);
    } catch (caught) {
      const { message, fields } = readApiError(caught);
      setError(message);
      setFieldErrors(fields);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <PageContainer narrow>
        <Card>
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="mt-3 text-sm text-slate-600">
            We sent a verification link to <strong>{email}</strong>. Click it, then log in.
          </p>
          <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-accent">
            Go to log in →
          </Link>
        </Card>
      </PageContainer>
    );
  }

  const options: Array<{ value: AccountType; title: string; body: string }> = [
    { value: "job_seeker", title: "I’m looking for a sales job", body: "Free. Search and apply." },
    { value: "employer", title: "I’m hiring salespeople", body: "Post jobs and promote them." }
  ];

  return (
    <PageContainer narrow>
      <Card>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Account type</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-md border p-3 text-sm ${
                    accountType === option.value ? "border-accent bg-blue-50" : "border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={option.value}
                    checked={accountType === option.value}
                    onChange={() => setAccountType(option.value)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{option.title}</span>
                  <span className="mt-1 block text-slate-600">{option.body}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <TextField
            label={accountType === "employer" ? "Work email" : "Email"}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-accent">
            Log in
          </Link>
        </p>
      </Card>
    </PageContainer>
  );
}
