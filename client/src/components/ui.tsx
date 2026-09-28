import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ApiError } from "../lib/api";

const fieldClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

type FieldWrapperProps = { label: string; error?: string; hint?: string; children: ReactNode };

function FieldWrapper({ label, error, hint, children }: FieldWrapperProps) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      {children}
      {hint && !error ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <input className={fieldClass} aria-invalid={Boolean(error)} {...props} />
    </FieldWrapper>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <textarea className={fieldClass} aria-invalid={Boolean(error)} {...props} />
    </FieldWrapper>
  );
}

export function SelectField({
  label,
  error,
  hint,
  options,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <select className={fieldClass} aria-invalid={Boolean(error)} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary: "bg-accent text-white hover:bg-blue-700 disabled:bg-blue-300",
    secondary: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:text-slate-400",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50"
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-blue-200 bg-blue-50 text-blue-900"
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "blue" | "amber" | "green" | "red" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-100 text-amber-900",
    green: "bg-emerald-50 text-emerald-800",
    red: "bg-red-50 text-red-800"
  };
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export type FieldErrors = Record<string, string>;

// Turns a 400/422 API error into { field: message } plus a top-level message.
export function readApiError(error: unknown): { message: string; fields: FieldErrors } {
  if (error instanceof ApiError && error.data && typeof error.data === "object") {
    const data = error.data as { error?: string; fields?: Record<string, string[] | undefined>; reasons?: Record<string, string> };
    const fields: FieldErrors = {};
    for (const [key, messages] of Object.entries(data.fields ?? {})) {
      if (messages?.[0]) {
        fields[key] = messages[0];
      }
    }
    Object.assign(fields, data.reasons ?? {});
    return { message: data.error ?? "Something went wrong", fields };
  }
  return { message: "Something went wrong. Please try again.", fields: {} };
}
