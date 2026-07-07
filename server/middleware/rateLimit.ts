import rateLimit from "express-rate-limit";
import { getEnv } from "../config/env";

export function authAttemptRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => getEnv().NODE_ENV === "test",
    message: { error: "Too many authentication attempts" }
  });
}
