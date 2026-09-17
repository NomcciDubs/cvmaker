// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import type { CvInputRecord, SavedCvRecord } from "../types";
import { CvLibrary } from "./CvLibrary";

const input: CvInputRecord = {
  id: "input-1", name: "Original notes", content: "Ada built analytical engines.",
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
};

const savedCv: SavedCvRecord = {
  id: "cv-1", ownerId: "user-a", name: "Engineering CV", sourceType: "output",
  cv: { personal_info: { full_name: "Ada Lovelace" } }, html: "<article>Ada</article>",
  language: "en", template: "cv_base", style: "modern",
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
};

describe("CvLibrary", () => {
  it("loads reusable sources and saved CV outputs", async () => {
    const user = userEvent.setup();
    const onUseInput = vi.fn();
    const onUseCv = vi.fn();
    const api = {
      listCvInputs: vi.fn().mockResolvedValue({ inputs: [input] }),
      listCvs: vi.fn().mockResolvedValue({ cvs: [savedCv] }),
      deleteCv: vi.fn(),
    } as unknown as CvmakerApi;

    renderLibrary(api, onUseInput, onUseCv);
    await user.click(screen.getByRole("button", { name: "Saved sources" }));
    await user.click(await screen.findByRole("button", { name: "Use source" }));
    expect(onUseInput).toHaveBeenCalledWith(input);

    await user.click(screen.getByRole("button", { name: "Saved CVs" }));
    await user.click(await screen.findByRole("button", { name: "Open CV" }));
    expect(onUseCv).toHaveBeenCalledWith(savedCv);
  });

  it("deletes a confirmed saved CV and refreshes the output query", async () => {
    const user = userEvent.setup();
    const deleteCv = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = {
      listCvInputs: vi.fn().mockResolvedValue({ inputs: [] }),
      listCvs: vi.fn().mockResolvedValue({ cvs: [savedCv] }),
      deleteCv,
    } as unknown as CvmakerApi;

    renderLibrary(api, vi.fn(), vi.fn());
    await user.click(screen.getByRole("button", { name: "Saved CVs" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteCv).toHaveBeenCalledWith("cv-1"));
    confirm.mockRestore();
  });
});

function renderLibrary(api: CvmakerApi, onUseInput: (input: CvInputRecord) => void, onUseCv: (cv: SavedCvRecord) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>
    <CvLibrary api={api} locale="en" messages={getMessages("en")} userId="user-a" onUseInput={onUseInput} onUseCv={onUseCv} />
  </QueryClientProvider>);
}
