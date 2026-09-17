// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { ApplicationRecord } from "../types";
import { ApplicationTracker, type ApplicationCvSnapshot } from "./ApplicationTracker";

const snapshot: ApplicationCvSnapshot = {
  cv: { personal_info: { full_name: "Ada Lovelace" } },
  html: "<article>Ada</article>",
  language: "en",
  template: "cv_base",
  style: "modern",
};

const applications: ApplicationRecord[] = [{
  ...snapshot,
  id: "application-1",
  company: "Nomcci",
  role: "Engineer",
  status: "draft",
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
}];

describe("ApplicationTracker", () => {
  it("saves the current CV snapshot and lists tracked applications", async () => {
    const user = userEvent.setup();
    const trackApplication = vi.fn().mockResolvedValue({ id: "application-2" });
    const api = {
      listApplications: vi.fn().mockResolvedValue({ applications }),
      trackApplication,
    } as unknown as CvmakerApi;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ApplicationTracker api={api} messages={getMessages("en")} locale="en" userId="user-a" snapshot={snapshot} defaultRole="Engineer" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Nomcci · Engineer")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Company"), "Nomcci");
    await user.click(screen.getByRole("button", { name: "Save application" }));

    await waitFor(() => expect(trackApplication).toHaveBeenCalledWith(expect.objectContaining({
      company: "Nomcci",
      role: "Engineer",
      html: "<article>Ada</article>",
      style: "modern",
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Application saved");
  });
});
