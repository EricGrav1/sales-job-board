import crypto from "node:crypto";
import type { Env } from "../config/env";
import type { User } from "../../shared/schema";

type EmailVerificationPayload = {
  sub: string;
  email: string;
  purpose: "email_verification";
  exp: number;
};

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(unsigned: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createEmailVerificationToken(user: Pick<User, "id" | "email">, env: Env) {
  const payload: EmailVerificationPayload = {
    sub: user.id,
    email: user.email,
    purpose: "email_verification",
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
  };
  const unsigned = encodeJson(payload);
  const signature = sign(unsigned, env.SESSION_SECRET);
  return `${unsigned}.${signature}`;
}

export function verifyEmailVerificationToken(token: string, env: Env) {
  const [unsigned, signature] = token.split(".");
  if (!unsigned || !signature) {
    throw new Error("Invalid verification token");
  }

  const expectedSignature = sign(unsigned, env.SESSION_SECRET);
  if (!signaturesMatch(signature, expectedSignature)) {
    throw new Error("Invalid verification token");
  }

  const payload = JSON.parse(Buffer.from(unsigned, "base64url").toString("utf8")) as EmailVerificationPayload;
  if (payload.purpose !== "email_verification" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid verification token");
  }

  return payload;
}
