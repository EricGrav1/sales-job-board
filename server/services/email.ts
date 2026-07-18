import { Resend } from "resend";
import { getEnv } from "../config/env";

function shouldLogEmail(env: ReturnType<typeof getEnv>) {
  return env.NODE_ENV !== "production" && env.RESEND_API_KEY.startsWith("placeholder");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendVerificationEmail(to: string, token: string) {
  const env = getEnv();
  const verificationUrl = new URL("/verify", env.APP_URL);
  verificationUrl.searchParams.set("token", token);

  if (shouldLogEmail(env)) {
    console.log(`[dev-email] Verification link for ${to}: ${verificationUrl.toString()}`);
    return { mode: "logged" as const, verificationUrl: verificationUrl.toString() };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Sales Job Board <onboarding@resend.dev>",
    to,
    subject: "Verify your Sales Job Board email",
    text: `Verify your email: ${verificationUrl.toString()}`,
    html: `<p>Verify your email:</p><p><a href="${verificationUrl.toString()}">Verify email</a></p>`
  });

  return { mode: "sent" as const, verificationUrl: verificationUrl.toString() };
}

export async function sendProofApprovedEmail(to: string) {
  const env = getEnv();

  if (shouldLogEmail(env)) {
    console.log(`[dev-email] Proof approved notification for ${to}`);
    return { mode: "logged" as const };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Sales Job Board <onboarding@resend.dev>",
    to,
    subject: "Your performance proof was approved",
    text: "Good news — your performance proof was approved and now appears on your public profile.",
    html: "<p>Good news — your performance proof was approved and now appears on your public profile.</p>"
  });

  return { mode: "sent" as const };
}

export async function sendProofRejectedEmail(to: string, reason: string) {
  const env = getEnv();

  if (shouldLogEmail(env)) {
    console.log(`[dev-email] Proof rejected notification for ${to}: ${reason}`);
    return { mode: "logged" as const };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Sales Job Board <onboarding@resend.dev>",
    to,
    subject: "Your performance proof was rejected",
    text: `Your performance proof was rejected. Reason: ${reason}`,
    html: `<p>Your performance proof was rejected.</p><p>Reason: ${escapeHtml(reason)}</p>`
  });

  return { mode: "sent" as const };
}
