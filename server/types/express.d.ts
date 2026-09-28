import type { Company, User } from "../../shared/schema";

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
      company?: Company;
    }
  }
}

export {};
