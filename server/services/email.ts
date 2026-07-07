import { Resend } from "resend";
import { getEnv } from "../config/env";

function shouldLogEmail(env: ReturnType<typeof getEnv>) {
  return env.NODE_ENV !== "production" && env.RESEND_API_KEY.startsWith("placeholder");
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
