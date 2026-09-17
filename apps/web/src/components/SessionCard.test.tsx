// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { Session } from "../types";
import { SessionCard } from "./SessionCard";

const session: Session = {
  user: { id: "user-a", email: "ada@example.com", name: "Ada", nickname: null, country: null },
  currentPage: { id: "page-1", name: "CVMaker", slug: "cvmaker", role: "DEFAULT", permissions: [] },
  session: { expiresAt: "2026-09-17T00:00:00.000Z" },
  usage: { used: 0, limit: 1 },
};

describe("SessionCard", () => {
  it("logs out of the development session", async () => {
    const user = userEvent.setup();
    const logoutForDevelopment = vi.fn().mockResolvedValue({ authenticated: false });
    const api = {
      getSession: vi.fn().mockResolvedValue(session),
      loginForDevelopment: vi.fn(),
      logoutForDevelopment,
    } as unknown as CvmakerApi;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionCard api={api} messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Log out" }));
    await waitFor(() => expect(logoutForDevelopment).toHaveBeenCalledOnce());
  });
});
