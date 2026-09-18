import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { RouterOutputs } from "~/utils/api";
import { PostCard } from "./index";

// index.tsx also imports @legendapp/list, @orpc/client and ~/utils/auth for
// the rest of the screen; PostCard doesn't use any of them, so stub them out
// rather than pulling their real (ESM-only) implementations into the test.
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
}));
jest.mock("@legendapp/list", () => ({ LegendList: () => null }));
jest.mock("@orpc/client", () => ({
  ORPCError: class ORPCError extends Error {},
}));
jest.mock("~/utils/api", () => ({ orpc: {} }));
jest.mock("~/utils/auth", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

const post: RouterOutputs["post"]["all"][number] = {
  id: "1",
  title: "Hello world",
  content: "This is a test post",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("PostCard", () => {
  it("renders the post title and content", () => {
    render(<PostCard post={post} onDelete={jest.fn()} />);

    expect(screen.getByText(post.title)).toBeOnTheScreen();
    expect(screen.getByText(post.content)).toBeOnTheScreen();
  });

  it("calls onDelete when the delete button is pressed", () => {
    const onDelete = jest.fn();
    render(<PostCard post={post} onDelete={onDelete} />);

    fireEvent.press(screen.getByText("Delete"));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
