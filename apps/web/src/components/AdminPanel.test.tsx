// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { AdminMetrics, AiUsage, PdfQuotaSettings } from "../types";
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

const aiUsage: AiUsage = {
  provider: "openrouter",
  currency: "USD",
  available: true,
  perModelAvailable: true,
  credits: { total: 10, used: 1.5, remaining: 8.5 },
  spend: { daily: 0.01, weekly: 0.2, monthly: 0.8 },
  byokSpend: { daily: 0.05, weekly: 0.4, monthly: 1.2 },
  models: [
    { model: "deepseek/deepseek-v4-flash", provider: "DeepSeek", requests: 12, promptTokens: 4000, completionTokens: 1200, cost: 0.1, byokCost: 1.1 },
    { model: "mistralai/mistral-small-2603", provider: "Mistral", requests: 3, promptTokens: 900, completionTokens: 300, cost: 0, byokCost: 0.1 },
  ],
  days: [{ date: "2026-09-19", requests: 5, cost: 0.02, byokCost: 0.3 }],
  updatedAt: "2026-09-20T00:00:00.000Z",
};

describe("AdminPanel", () => {
  it("hides everything from non-admin roles", () => {
    const api = {
      getAdminMetrics: vi.fn(),
      getPdfLimits: vi.fn(),
      getAiUsage: vi.fn(),
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
      getAiUsage: vi.fn().mockResolvedValue({ usage: aiUsage }),
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
    expect(await screen.findByText("AI spend")).toBeInTheDocument();
    expect(screen.getByText("deepseek/deepseek-v4-flash")).toBeInTheDocument();

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

  it("reports unavailable AI spend when no provider is configured", async () => {
    const api = {
      getAdminMetrics: vi.fn().mockResolvedValue({ metrics }),
      getPdfLimits: vi.fn().mockResolvedValue({ limits }),
      getAiUsage: vi.fn().mockResolvedValue({ usage: null }),
      updatePdfLimits: vi.fn(),
    } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminPanel api={api} messages={getMessages("en")} locale="en" userRole="SUPER_ADMIN" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("AI spend is not available in this deployment.")).toBeInTheDocument();
  });
});
