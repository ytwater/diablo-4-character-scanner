import { authRouter } from "./router/auth";
import { postRouter } from "./router/post";
import { scanRouter } from "./router/scan";

export const appRouter = {
  auth: authRouter,
  post: postRouter,
  scan: scanRouter,
};

// export type definition of API
export type AppRouter = typeof appRouter;
