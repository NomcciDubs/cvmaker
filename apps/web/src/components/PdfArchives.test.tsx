// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { PdfArchiveItem } from "../types";
import { PdfArchives, PdfExportButton } from "./PdfArchives";

const archives: PdfArchiveItem[] = [{
  id: "archive-1",
  filename: "00000000-0000-4000-8000-000000000006-ada.pdf",
  sizeBytes: 2_048,
  createdAt: "2026-09-16T00:00:00.000Z",
  downloadPath: "/archives/user-a/output/00000000-0000-4000-8000-000000000006-ada.pdf",
}];

function renderWithClient(element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

describe("PdfArchives", () => {
  it("lists archives with download links and deletes with confirmation", async () => {
    const user = userEvent.setup();
    const deleteArchive = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = {
      listArchives: vi.fn().mockResolvedValue({ archives }),
      deleteArchive,
    } as unknown as CvmakerApi;

    renderWithClient(<PdfArchives api={api} locale="en" messages={getMessages("en")} userId="user-a" />);
    const link = await screen.findByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", archives[0]!.downloadPath);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteArchive).toHaveBeenCalledWith("archive-1"));
    confirm.mockRestore();
  });
});

describe("PdfExportButton", () => {
  const snapshot = {
    cv: { personal_info: { full_name: "Ada Lovelace" } },
    language: "en" as const,
    template: "cv_base" as const,
    style: "modern" as const,
    name: "Ada CV",
  };

  it("shows the download link after a successful export", async () => {
    const user = userEvent.setup();
    const exportPdf = vi.fn().mockResolvedValue({ downloadPath: "/archives/user-a/output/ada.pdf" });
    const api = { exportPdf } as unknown as CvmakerApi;

    renderWithClient(<PdfExportButton api={api} messages={getMessages("en")} snapshot={snapshot} userId="user-a" />);
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(await screen.findByRole("status")).toHaveTextContent("PDF ready");
    expect(exportPdf).toHaveBeenCalledWith(snapshot);
  });

  it("maps quota errors to readable messages", async () => {
    const user = userEvent.setup();
    const api = {
      exportPdf: vi.fn().mockRejectedValue(new ApiError("pdf_daily_limit_reached", 429)),
    } as unknown as CvmakerApi;

    renderWithClient(<PdfExportButton api={api} messages={getMessages("en")} snapshot={snapshot} userId="user-a" />);
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Daily PDF export limit");
  });
});
