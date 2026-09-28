import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "../../shared/schema";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    req.session.destroy(() => undefined);
    return res.status(401).json({ error: "Authentication required" });
  }

  req.currentUser = user;
  return next();
}

export function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser?.emailVerifiedAt) {
    return res.status(403).json({ error: "Email verification required" });
  }

  return next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  const user = userId
    ? await db.query.users.findFirst({
        where: eq(users.id, userId)
      })
    : undefined;

  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  req.currentUser = user;
  return next();
}

export function requireRole(...roles: Array<User["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) {
      return res.status(403).json({ error: "This account type cannot access this resource" });
    }

    return next();
  };
}
