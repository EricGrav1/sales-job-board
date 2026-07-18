import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import helmet from "helmet";
import { getEnv } from "./config/env";
import { pool } from "./db";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { proofsRouter } from "./routes/proofs";
import { publicProfileRouter } from "./routes/publicProfile";
import { recordsRouter } from "./routes/records";

export function createApp() {
  const env = getEnv();
  const PgSession = connectPgSimple(session);
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      name: "sjb.sid",
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true
      }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production"
      }
    })
  );

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/records", recordsRouter);
  app.use("/api/proofs", proofsRouter);
  app.use("/api/r", publicProfileRouter);

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
