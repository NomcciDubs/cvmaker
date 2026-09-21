// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CvmakerApi } from "../api/cvmaker";
import { getMessages } from "../i18n/messages";
import { saveDraft } from "../draft-store";
import { CvEditor } from "./CvEditor";

async function fillTile(user: UserEvent, label: string, value: string) {
  await user.click(screen.getByRole("button", { name: label }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText(label), value);
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

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
    expect(await screen.findByTitle("CV preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");
    expect(screen.getByTitle("CV preview")).toHaveAttribute("sandbox", "");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Render preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last successful preview");
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(screen.getByTitle("CV preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");
  });

  it("persists pasted source text before importing and previewing it", async () => {
    const user = userEvent.setup();
    const importedCv = {
      personal_info: { full_name: "Grace Hopper" },
      summary: "Compiler pioneer",
      experience: [], education: [], skills: [], languages: [],
    };
    const saveCvInput = vi.fn().mockResolvedValue({ id: "input-1" });
    const streamImportCv = vi.fn().mockResolvedValue({ cv: importedCv, importWorkflowId: "workflow-1" });
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Imported CV</article>" });
    const api = { saveCvInput, streamImportCv, renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
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

    expect(await screen.findByTitle("CV preview")).toHaveAttribute("srcdoc", "<article>Imported CV</article>");
    expect(saveCvInput).toHaveBeenCalledWith({ content: "Grace Hopper compiler experience", name: undefined });
    expect(streamImportCv).toHaveBeenCalledWith({ description: "Grace Hopper compiler experience", language: "en" }, expect.anything());
    expect(saveCvInput.mock.invocationCallOrder[0]).toBeLessThan(streamImportCv.mock.invocationCallOrder[0]!);
    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({ cv: importedCv, style: "sidebar_green" }));
  });

  it("applies target role and instructions in one AI use and supports undo", async () => {
    const user = userEvent.setup();
    const improvedCv = { personal_info: { full_name: "Ada Lovelace" }, summary: "AI summary" };
    const renderCv = vi.fn()
      .mockResolvedValueOnce({ html: "<article>Original</article>" })
      .mockResolvedValueOnce({ html: "<article>Improved</article>" })
      .mockResolvedValueOnce({ html: "<article>Original again</article>" });
    const streamModifyCv = vi.fn().mockResolvedValue({ cv: improvedCv });
    const api = { renderCv, streamModifyCv, getSession: vi.fn() } as unknown as CvmakerApi;
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
    await fillTile(user, "Target role", "Platform Engineer");
    await fillTile(user, "Additional instruction", "Emphasize reliability");
    await user.click(screen.getByRole("button", { name: "Apply with AI" }));

    await waitFor(() => expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Improved</article>"));
    expect(streamModifyCv).toHaveBeenCalledWith(expect.objectContaining({
      instruction: "Tailor this CV for the target role: Platform Engineer.\nEmphasize reliability",
      language: "en",
    }), expect.anything());

    await user.click(screen.getByRole("button", { name: "Undo AI result" }));
    await waitFor(() => expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Original again</article>"));
  });

  it("asks before restoring a version 3 draft scoped to the current user", async () => {
    const user = userEvent.setup();
    saveDraft(localStorage, "user-a", {
      step: "source",
      maxStep: 1,
      sourceMode: "manual",
      cv: { personal_info: { full_name: "Draft Owner" }, experience: [] },
      html: "",
      template: "cv_base",
      style: "minimal",
      documentLanguage: "en",
      aiTargetLanguage: "en",
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

    expect(await screen.findByRole("dialog", { name: "Continue your draft?" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Continue your draft?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore draft" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    await fillTile(user, "CV name", "Ada Engineering CV");
    await user.click(screen.getByRole("button", { name: "Save CV" }));

    expect(await screen.findByRole("status")).toHaveTextContent("CV saved");
    expect(saveCv).toHaveBeenCalledWith(expect.objectContaining({
      name: "Ada Engineering CV",
      sourceType: "output",
      html: "<article>Ada</article>",
      language: "en",
    }));
  });

  it("marks completed steps, the current step and locked steps distinctly", async () => {
    const user = userEvent.setup();
    const api = { renderCv: vi.fn(), getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    const templateStep = screen.getByRole("button", { name: /Template/ });
    const sourceStep = screen.getByRole("button", { name: /Source/ });
    expect(templateStep).toHaveAttribute("data-state", "current");
    expect(sourceStep).toHaveAttribute("data-state", "locked");
    expect(sourceStep).toBeDisabled();
    expect(screen.getByRole("button", { name: /Improve/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(templateStep).toHaveAttribute("data-state", "done");
    expect(templateStep.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Source/ })).toHaveAttribute("data-state", "current");
    expect(screen.getByRole("button", { name: /Source/ }).querySelector("svg")).toBeNull();
  });

  it("blocks continuing from a stale preview until it is rendered again", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Canonical CV</article>" });
    const api = { renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));
    await screen.findByTitle("CV preview");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByLabelText("Full name"), " Byron");
    await user.click(screen.getByRole("button", { name: /Preview/ }));

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent("changed after this preview");

    await user.click(screen.getByRole("button", { name: "Render preview" }));
    await waitFor(() => expect(continueButton).toBeEnabled());
  });

  it("keeps the current preview when only the AI target language changes", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Canonical CV</article>" });
    const saveCv = vi.fn().mockImplementation(async (body) => ({
      cv: { ...body, id: "cv-1", ownerId: "user-a", createdAt: "now", updatedAt: "now" },
    }));
    const api = { renderCv, saveCv, getSession: vi.fn() } as unknown as CvmakerApi;
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

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "portugues");
    await user.click(screen.getByRole("option", { name: /Portuguese.*Português/ }));

    expect(renderCv).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Canonical CV</article>");

    await fillTile(user, "CV name", "Ada CV");
    await user.click(screen.getByRole("button", { name: "Save CV" }));
    expect(saveCv).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));
  });

  it("applies AI in the target language and restores the previous language on undo", async () => {
    const user = userEvent.setup();
    const improvedCv = { personal_info: { full_name: "Ada Lovelace" }, summary: "Resumo IA" };
    const renderCv = vi.fn()
      .mockResolvedValueOnce({ html: "<article>Original</article>" })
      .mockResolvedValueOnce({ html: "<article>Melhorado</article>" })
      .mockResolvedValueOnce({ html: "<article>Original again</article>" });
    const streamModifyCv = vi.fn().mockResolvedValue({ cv: improvedCv });
    const api = { renderCv, streamModifyCv, getSession: vi.fn() } as unknown as CvmakerApi;
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

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "portugues");
    await user.click(screen.getByRole("option", { name: /Portuguese.*Português/ }));
    await fillTile(user, "Target role", "Engineer");
    await fillTile(user, "Additional instruction", "Be concise");
    await user.click(screen.getByRole("button", { name: "Apply with AI" }));

    await waitFor(() => expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Melhorado</article>"));
    expect(streamModifyCv).toHaveBeenCalledWith(expect.objectContaining({ language: "pt" }), expect.anything());
    expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({ language: "pt" }));

    await user.click(screen.getByRole("button", { name: "Undo AI result" }));
    await waitFor(() => expect(renderCv).toHaveBeenCalledWith(expect.objectContaining({ language: "en" })));
    await waitFor(() => expect(screen.getByTitle("Final CV preview")).toHaveAttribute("srcdoc", "<article>Original again</article>"));
  });

  it("blocks saving and exporting from a stale step-4 preview until regenerated", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Canonical CV</article>" });
    const saveCv = vi.fn().mockImplementation(async (body) => ({
      cv: { ...body, id: "cv-1", ownerId: "user-a", createdAt: "now", updatedAt: "now" },
    }));
    const api = { renderCv, saveCv, getSession: vi.fn() } as unknown as CvmakerApi;
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
    await fillTile(user, "CV name", "Ada CV");

    expect(screen.getByRole("button", { name: "Save CV" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Source/ }));
    await user.type(screen.getByLabelText("Full name"), " Byron");
    await user.click(screen.getByRole("button", { name: /Improve/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("changed after this preview");
    expect(screen.getByRole("button", { name: "Save CV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Render preview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save CV" })).toBeEnabled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled());
  });

  it("shows render failures where they happen and clears them when changing steps", async () => {
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

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));
    await screen.findByTitle("CV preview");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByLabelText("Full name"), " Byron");
    await user.click(screen.getByRole("button", { name: /Preview/ }));

    await user.click(screen.getByRole("button", { name: "Render preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be updated");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
    expect(screen.queryByText(/could not be updated/)).toBeNull();
  });

  it("reflects the document name, step and save status in the masthead", async () => {
    const user = userEvent.setup();
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Ada</article>" });
    const saveCv = vi.fn().mockImplementation(async (body) => ({
      cv: { ...body, id: "cv-1", ownerId: "user-a", createdAt: "now", updatedAt: "now" },
    }));
    const api = { renderCv, saveCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Unnamed CV" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Local draft")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Render preview" }));

    expect(await screen.findByText("Step 3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await fillTile(user, "CV name", "Ada Engineering CV");
    expect(screen.getByRole("heading", { name: "Ada Engineering CV" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save CV" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("moves focus to the new step heading on navigation", async () => {
    const user = userEvent.setup();
    const api = { renderCv: vi.fn(), getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "CV editor" })).toHaveFocus();
  });

  it("imports CVs whose links arrive as bare strings without blocking the stage", async () => {
    const user = userEvent.setup();
    const importedCv = {
      personal_info: { full_name: "Grace Hopper", links: ["https://example.com/a", "example.com/b"] },
      summary: "Compiler pioneer",
      experience: [], education: [], skills: [], languages: [],
    };
    const saveCvInput = vi.fn().mockResolvedValue({ id: "input-1" });
    const streamImportCv = vi.fn().mockResolvedValue({ cv: importedCv, importWorkflowId: "workflow-1" });
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Imported CV</article>" });
    const api = { saveCvInput, streamImportCv, renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
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

    expect(await screen.findByTitle("CV preview")).toHaveAttribute("srcdoc", "<article>Imported CV</article>");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a loading overlay while AI import runs", async () => {
    const user = userEvent.setup();
    const importedCv = {
      personal_info: { full_name: "Grace Hopper" },
      summary: "Compiler pioneer",
      experience: [], education: [], skills: [], languages: [],
    };
    let resolveImport!: (value: { cv: typeof importedCv; importWorkflowId: string }) => void;
    const saveCvInput = vi.fn().mockResolvedValue({ id: "input-1" });
    const streamImportCv = vi.fn(() => new Promise<{ cv: typeof importedCv; importWorkflowId: string }>((resolve) => {
      resolveImport = resolve;
    }));
    const renderCv = vi.fn().mockResolvedValue({ html: "<article>Imported CV</article>" });
    const api = { saveCvInput, streamImportCv, renderCv, getSession: vi.fn() } as unknown as CvmakerApi;
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CvEditor api={api} locale="en" messages={getMessages("en")} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("tab", { name: "Import CV" }));
    await user.type(screen.getByLabelText("Or paste the CV text"), "Grace Hopper compiler experience");
    await user.click(screen.getByRole("button", { name: "Import with AI" }));

    await waitFor(() => expect(container.querySelector(".ai-loading-overlay")).not.toBeNull());
    expect(container.querySelector(".ai-loading-overlay p")).toHaveTextContent("Building your CV...");

    resolveImport({ cv: importedCv, importWorkflowId: "workflow-1" });

    expect(await screen.findByTitle("CV preview")).toHaveAttribute("srcdoc", "<article>Imported CV</article>");
    await waitFor(() => expect(container.querySelector(".ai-loading-overlay")).toBeNull());
  });
});
