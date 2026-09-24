import bcrypt from "bcrypt";
import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { authAttemptRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { getEnv } from "../config/env";
import { findCompanyForUser } from "../services/companies";
import { sendVerificationEmail } from "../services/email";
import { createEmailVerificationToken, verifyEmailVerificationToken } from "../services/verificationToken";
import { asyncHandler, publicUser } from "../utils/http";
import { events, repProfiles, users } from "../../shared/schema";
import { loginSchema, registerSchema, verifyEmailSchema } from "../../shared/validators";

export const authRouter = Router();

const authLimiter = authAttemptRateLimit();

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

authRouter.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const env = getEnv();
    const { email, password, accountType } = req.body;
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const role = email === env.ADMIN_EMAIL ? "admin" : accountType === "employer" ? "employer" : "rep";

    try {
      const [user] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          role
        })
        .returning();

      await db.insert(events).values({
        actorUserId: user.id,
        type: "signup"
      });

      const token = createEmailVerificationToken(user, env);
      await sendVerificationEmail(user.email, token);

      return res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return res.status(409).json({ error: "Email already registered" });
      }
      throw error;
    }
  })
);

authRouter.post(
  "/verify",
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const env = getEnv();
    let payload: ReturnType<typeof verifyEmailVerificationToken>;

    try {
      payload = verifyEmailVerificationToken(req.body.token, env);
    } catch {
      return res.status(400).json({ error: "Invalid verification token" });
    }

    const [user] = await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(users.id, payload.sub), eq(users.email, payload.email)))
      .returning();

    if (!user) {
      return res.status(400).json({ error: "Invalid verification token" });
    }

    return res.status(200).json({ user: publicUser(user) });
  })
);

authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    return res.status(200).json({ user: publicUser(user) });
  })
);

authRouter.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: "Unable to log out" });
    }
    res.clearCookie("sjb.sid");
    return res.status(204).send();
  });
});

authRouter.get(
  "/me",
  asyncHandler(requireAuth),
  asyncHandler(async (req, res) => {
    const [profile, company] = await Promise.all([
      db.query.repProfiles.findFirst({
        where: eq(repProfiles.userId, req.currentUser!.id)
      }),
      findCompanyForUser(req.currentUser!.id)
    ]);

    return res.status(200).json({
      user: publicUser(req.currentUser!),
      profile: profile ?? null,
      company
    });
  })
);
