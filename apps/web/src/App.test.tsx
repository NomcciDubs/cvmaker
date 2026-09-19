// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import type { CvmakerApi } from "./api/cvmaker";
import type { Session } from "./types";
import { App } from "./App";

const locationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
const replace = vi.fn();

beforeEach(() => {
  replace.mockClear();
  Object.defineProperty(window, "location", {
    value: { ...window.location, replace },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  if (locationDescriptor) Object.defineProperty(window, "location", locationDescriptor);
});

const session: Session = {
  user: { id: "user-a", email: "ada@example.test", name: null, nickname: null, country: null },
  currentPage: { id: "page-1", name: "CVMaker", slug: "cvmaker", role: "USER", permissions: [] },
  session: { expiresAt: "2026-09-20T00:00:00.000Z" },
  usage: { used: 0, limit: 1 },
};

function renderApp(getSession: () => Promise<Session>) {
  const api = { getSession } as unknown as CvmakerApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <App api={api} />
    </QueryClientProvider>,
  );
  return { api, queryClient };
}

describe("App boot", () => {
  it("shows a splash while the session loads", () => {
    renderApp(() => new Promise<Session>(() => {}));

    expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to login on a 401 without an error page", async () => {
    renderApp(() => Promise.reject(new ApiError("unauthorized", 401)));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error page with retry and status link when the session fails", async () => {
    const user = userEvent.setup();
    const getSession = vi.fn<() => Promise<Session>>()
      .mockRejectedValueOnce(new ApiError("boom", 500))
      .mockResolvedValue(session);
    renderApp(getSession);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("could not be loaded");
    expect(replace).not.toHaveBeenCalled();

    const statusLink = screen.getByRole("link", { name: "View system status" });
    expect(statusLink).toHaveAttribute("href", "https://status.nomcci.top");
    expect(statusLink).toHaveAttribute("target", "_blank");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Unnamed CV" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the workspace when the session loads", async () => {
    renderApp(() => Promise.resolve(session));

    expect(await screen.findByRole("heading", { name: "Unnamed CV" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
