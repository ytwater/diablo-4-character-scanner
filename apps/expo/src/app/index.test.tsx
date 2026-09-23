import type { ReactNode } from "react";
import { Text as MockText } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Index from "./index";

// Index (and ScanLink) render <Stack.Screen> and <Link>, which need a real
// navigator context (react-navigation's useRoute) that isn't set up for a
// bare component render in this smoke test. Stub them with no-ops/passthrough
// since this test only checks the signed-out auth copy renders. `MockText`
// is referenced (not required) inside the factory because Jest allows
// out-of-scope variables in a jest.mock() factory only when they're
// prefixed with "mock" (case-insensitive).
jest.mock("expo-router", () => {
  const StackScreen = () => null;
  const Stack = Object.assign(
    ({ children }: { children?: ReactNode }) => children ?? null,
    { Screen: StackScreen },
  );
  const Link = ({
    asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children?: ReactNode;
    [key: string]: unknown;
  }) => (asChild ? children : <MockText {...props}>{children}</MockText>);
  return { Stack, Link };
});

// ~/utils/auth resolves to auth.native.ts (or auth.web.ts) depending on the
// Jest platform, but both export the same `authClient` shape, so mocking the
// bare specifier covers whichever file actually resolves.
jest.mock("~/utils/auth", () => ({
  authClient: {
    useSession: () => ({ data: null }),
  },
}));

// ~/utils/api similarly splits into api.native.ts/api.web.ts, and both throw
// at import time when getBaseUrl() can't find a dev-server host — mock it so
// importing Index doesn't need a real API base URL.
jest.mock("~/utils/api", () => ({
  orpc: {
    character: {
      list: {
        queryOptions: () => ({
          queryKey: ["character", "list"],
          queryFn: () => Promise.resolve([]),
        }),
      },
    },
  },
}));

it("shows sign-in prompt when signed out", () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <Index />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Not logged in/i)).toBeTruthy();
});
