import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";

export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        fields: parsed.error.flatten().fieldErrors
      });
    }

    req.body = parsed.data as z.infer<TSchema>;
    return next();
  };
}

export function validateParams<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        fields: parsed.error.flatten().fieldErrors
      });
    }

    return next();
  };
}
