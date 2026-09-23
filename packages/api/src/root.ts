import { authRouter } from "./router/auth";
import { scanRouter } from "./router/scan";

export const appRouter = {
  auth: authRouter,
  scan: scanRouter,
};

// export type definition of API
export type AppRouter = typeof appRouter;
