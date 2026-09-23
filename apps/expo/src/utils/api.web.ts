import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";

import type { AppRouter } from "@acme/api";

import { getBaseUrl } from "./base-url";

export const queryClient = new QueryClient();

const link = new RPCLink({
  url: `${getBaseUrl()}/api/rpc`,
  fetch(request, init) {
    return globalThis.fetch(request, {
      ...init,
      credentials: "include",
    });
  },
  headers() {
    return {
      "x-orpc-source": "expo-web",
    };
  },
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

export type { RouterInputs, RouterOutputs } from "@acme/api";
