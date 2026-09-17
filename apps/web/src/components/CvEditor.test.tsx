import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import { CvEditor } from "./CvEditor";

describe("CvEditor", () => {
  it("sends the selected catalog pair and preserves the last successful preview", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn()
      .mockResolvedValueOnce({ html: "<article>Canonical CV</article>" })
      .mockRejectedValueOnce(new Error("Render failed"));
    const api = { renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("radio", { name: /Classic/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));

    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({
      language: "en",
      template: "cv_base",
      style: "classic",
      cv: expect.objectContaining({ personal_info: expect.objectContaining({ full_name: "Ada Lovelace" }) }),
    }));
    expect(await screen.findByTitle("Server preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");
    expect(screen.getByTitle("Server preview")).toHaveAttribute("sandbox", "");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Render preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last successful preview");
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(screen.getByTitle("Server preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");
  });

  it("persists pasted source text before importing and previewing it", async () => {
    const user = userEvent.setup();
    const importedCv = {
      personal_info: { full_name: "Grace Hopper" },
      summary: "Compiler pioneer",
      experience: [], education: [], skills: [], languages: [],
    };
    const saveCvInput = vi.fn().mockResolvedValue({ id: "input-1" });
    const importCv = vi.fn().mockResolvedValue({ cv: importedCv, importWorkflowId: "workflow-1" });
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Imported CV</article>" });
    const api = { saveCvInput, importCv, renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("tab", { name: "Import CV" }));
    await user.type(screen.getByLabelText("Or paste the CV text"), "Grace Hopper compiler experience");
    await user.click(screen.getByRole("button", { name: "Import with AI" }));

    expect(await screen.findByTitle("Server preview")).toHaveAttribute("srcdoc", "<article>Imported CV</article>");
    expect(saveCvInput).toHaveBeenCalledWith({ content: "Grace Hopper compiler experience", name: undefined });
    expect(importCv).toHaveBeenCalledWith({ description: "Grace Hopper compiler experience", language: "en" });
    expect(saveCvInput.mock.invocationCallOrder[0]).toBeLessThan(importCv.mock.invocationCallOrder[0]!);
    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({ cv: importedCv, style: "sidebar_green" }));
  });
});
