// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { AdminMetrics, PdfQuotaSettings } from "../types";
import { AdminPanel } from "./AdminPanel";

const metrics: AdminMetrics = {
  totals: { applications: 7, users: 3, companies: 5 },
  savedCvs: { savedCvs: 4 },
  usage: { aiUses: 9, aiUsers: 2 },
  topCompanies: [{ company: "Nomcci", applications: 6 }],
  recentApplications: [{
    company: "Nomcci",
    role: "Engineer",
    status: "draft",
    language: "en",
    style: "modern",
    createdAt: "2026-09-16T00:00:00.000Z",
  }],
};

const limits: PdfQuotaSettings = {
  defaultDaily: 3,
  friendDaily: 20,
  superAdminDaily: null,
  maxArchivedPdfs: 20,
  maxArchivedPdfBytes: 26_214_400,
};

describe("AdminPanel", () => {
  it("hides everything from non-admin roles", () => {
    const api = {
      getAdminMetrics: vi.fn(),
      getPdfLimits: vi.fn(),
      updatePdfLimits: vi.fn(),
    } as unknown as CvmakerApi;
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AdminPanel api={api} messages={getMessages("en")} locale="en" userRole="DEFAULT" />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(api.getAdminMetrics).not.toHaveBeenCalled();
  });

  it("shows metrics and saves limits with MiB converted to bytes", async () => {
    const user = userEvent.setup();
    const updatePdfLimits = vi.fn().mockResolvedValue({ limits });
    const api = {
      getAdminMetrics: vi.fn().mockResolvedValue({ metrics }),
      getPdfLimits: vi.fn().mockResolvedValue({ limits }),
      updatePdfLimits,
    } as unknown as CvmakerApi;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminPanel api={api} messages={getMessages("en")} locale="en" userRole="SUPER_ADMIN" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Top companies")).toBeInTheDocument();
    expect(screen.getByText("Nomcci · Engineer · draft")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Max archive size (MiB)"));
    await user.type(screen.getByLabelText("Max archive size (MiB)"), "50");
    await user.click(screen.getByRole("button", { name: "Save limits" }));

    expect(updatePdfLimits).toHaveBeenCalledWith(expect.objectContaining({
      defaultDaily: 3,
      friendDaily: 20,
      superAdminDaily: null,
      maxArchivedPdfs: 20,
      maxArchivedPdfBytes: 50 * 1_048_576,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Limits saved");
  });
});
