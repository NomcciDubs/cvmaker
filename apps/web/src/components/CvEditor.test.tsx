import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import { saveDraft } from "../draft-store";
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

  it("applies target role and instructions in one AI use and supports undo", async () => {
    const user = userEvent.setup();
    const improvedCv = { personal_info: { full_name: "Ada Lovelace" }, summary: "AI summary" };
    const renderCv = vi.fn()
      .mockResolvedValueOnce({ html: "<article>Original</article>" })
      .mockResolvedValueOnce({ html: "<article>Improved</article>" })
      .mockResolvedValueOnce({ html: "<article>Original again</article>" });
    const modifyCv = vi.fn().mockResolvedValue({ cv: improvedCv });
    const api = { renderCv, modifyCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Target role"), "Platform Engineer");
    await user.type(screen.getByLabelText("Additional instruction"), "Emphasize reliability");
    await user.click(screen.getByRole("button", { name: "Apply with AI" }));

    await waitFor(() => expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Improved</article>"));
    expect(modifyCv).toHaveBeenCalledWith(expect.objectContaining({
      instruction: "Tailor this CV for the target role: Platform Engineer.\nEmphasize reliability",
      language: "en",
    }));

    await user.click(screen.getByRole("button", { name: "Undo AI result" }));
    await waitFor(() => expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Original again</article>"));
  });

  it("asks before restoring a version 2 draft scoped to the current user", async () => {
    const user = userEvent.setup();
    saveDraft(localStorage, "user-a", {
      step: "source",
      maxStep: 1,
      sourceMode: "manual",
      cv: { personal_info: { full_name: "Draft Owner" }, experience: [] },
      html: "",
      template: "cv_base",
      style: "minimal",
      cvLanguage: "en",
      sourceInput: "",
      importName: "",
      cvName: "Draft CV",
      importWorkflowId: null,
      importedOriginalCv: null,
      targetRole: "",
      jobDescription: "",
      instruction: "",
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    const api = {
      renderCv: vi.fn(),
      getSession: vi.fn(),
      listCvInputs: vi.fn().mockResolvedValue({ inputs: [] }),
      listCvs: vi.fn().mockResolvedValue({ cvs: [] }),
      deleteCv: vi.fn(),
    } as unknown as CvmakerApi;
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} userId="user-a" />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Restore draft" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Draft Owner");
    expect(screen.getByRole("button", { name: /Source/ })).toHaveAttribute("aria-current", "step");
  });

  it("saves the current rendered output to the private CV library", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Ada</article>" });
    const saveCv = vi.fn().mockImplementation(async (body) => ({
      cv: { ...body, id: "cv-1", ownerId: "user-a", createdAt: "now", updatedAt: "now" },
    }));
    const api = { renderCv, saveCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(<QueryClientProvider client={queryClient}>
      <CvEditor api={api} locale="en" messages={getMessages("en")} />
    </QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("CV name"), "Ada Engineering CV");
    await user.click(screen.getByRole("button", { name: "Save CV" }));

    expect(await screen.findByRole("status")).toHaveTextContent("CV saved");
    expect(saveCv).toHaveBeenCalledWith(expect.objectContaining({
      name: "Ada Engineering CV",
      sourceType: "output",
      html: "<article>Ada</article>",
      language: "en",
    }));
  });
});
