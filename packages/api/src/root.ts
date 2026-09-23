import { authRouter } from "./router/auth";
import { characterRouter } from "./router/character";
import { scanRouter } from "./router/scan";

export const appRouter = {
  auth: authRouter,
  character: characterRouter,
  scan: scanRouter,
};

// export type definition of API
export type AppRouter = typeof appRouter;
