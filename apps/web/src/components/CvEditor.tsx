import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { CvData, CvInputRecord, CvStyle, Locale, RenderCvRequest, SavedCvRecord } from "../types";
import { extractPdfText } from "../pdf-import";
import { clearDraft, loadDraft, saveDraft, type CvDraftData } from "../draft-store";
import { createWizardState, TEMPLATE_CHOICES, WIZARD_STEPS, wizardReducer, type WizardStep } from "../wizard";
import { CvLibrary } from "./CvLibrary";
import { PhotoManager } from "./PhotoManager";

interface CvEditorProps {
  api: CvmakerApi;
  locale: Locale;
  messages: Messages;
  userId?: string;
}

const blankExperience = { role: "", company: "", location: "", start_date: "", end_date: "", description: [] as string[] };

export function CvEditor({ api, locale, messages, userId }: CvEditorProps) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(wizardReducer, undefined, createWizardState);
  const [highlights, setHighlights] = useState("");
  const [sourceMode, setSourceMode] = useState<"manual" | "import">("manual");
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [fileError, setFileError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [instruction, setInstruction] = useState("");
  const [cvLanguage, setCvLanguage] = useState<Locale>(locale);
  const [cvName, setCvName] = useState("");
  const [savedCvId, setSavedCvId] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CvDraftData | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [draftUserId, setDraftUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      if (draftUserId) resetEditor();
      setPendingDraft(null);
      setDraftReady(false);
      setDraftUserId(null);
      return;
    }
    try {
      if (draftUserId && draftUserId !== userId) resetEditor();
      const draft = loadDraft(window.localStorage, userId);
      setPendingDraft(draft);
      setDraftReady(!draft);
      setDraftError(false);
      setDraftUserId(userId);
    } catch {
      setDraftError(true);
    }
  }, [userId]);

  function resetEditor() {
    dispatch({ type: "reset" });
    setSourceMode("manual");
    setImportText("");
    setImportName("");
    setTargetRole("");
    setJobDescription("");
    setInstruction("");
    setCvLanguage(locale);
    setCvName("");
    setSavedCvId(null);
  }

  useEffect(() => {
    if (!userId || draftUserId !== userId || !draftReady || pendingDraft || savedCvId) return;
    const hasContent = state.step !== "template" || Boolean(state.cv.personal_info.full_name || state.cv.summary || importText);
    if (!hasContent) return;
    try {
      saveDraft(window.localStorage, userId, {
        step: state.step,
        maxStep: state.maxStep,
        sourceMode,
        cv: state.cv,
        html: state.html,
        template: state.choice.template,
        style: state.choice.style,
        cvLanguage,
        sourceInput: importText,
        importName,
        cvName,
        importWorkflowId: state.importWorkflowId,
        importedOriginalCv: state.importedOriginalCv,
        targetRole,
        jobDescription,
        instruction,
        updatedAt: new Date().toISOString(),
      });
      setDraftError(false);
    } catch {
      setDraftError(true);
    }
  }, [cvLanguage, cvName, draftReady, draftUserId, importName, importText, instruction, jobDescription, pendingDraft, savedCvId, sourceMode, state, targetRole, userId]);

  function restorePendingDraft() {
    if (!pendingDraft) return;
    dispatch({ type: "restoreDraft", draft: pendingDraft });
    setSourceMode(pendingDraft.sourceMode);
    setImportText(pendingDraft.sourceInput);
    setImportName(pendingDraft.importName);
    setCvName(pendingDraft.cvName);
    setTargetRole(pendingDraft.targetRole);
    setJobDescription(pendingDraft.jobDescription);
    setInstruction(pendingDraft.instruction);
    setCvLanguage(pendingDraft.cvLanguage);
    setPendingDraft(null);
    setDraftReady(true);
  }

  function discardPendingDraft() {
    try {
      if (userId) clearDraft(window.localStorage, userId);
      setDraftError(false);
    } catch {
      setDraftError(true);
    }
    setPendingDraft(null);
    setDraftReady(true);
  }
  const render = useMutation({
    mutationFn: (body: RenderCvRequest) => api.renderCv(body),
    onSuccess: (data) => dispatch({ type: "rendered", html: data.html }),
  });
  const importCv = useMutation({
    mutationFn: async ({ description, name }: { description: string; name?: string }) => {
      await api.saveCvInput({ content: description, name });
      const imported = await api.importCv({ description, language: cvLanguage });
      const preview = await api.renderCv({
        cv: imported.cv,
        language: cvLanguage,
        template: state.choice.template,
        style: state.choice.style,
      });
      return { ...imported, html: preview.html };
    },
    onSuccess: (result) => {
      dispatch({ type: "imported", cv: result.cv, importWorkflowId: result.importWorkflowId });
      dispatch({ type: "rendered", html: result.html });
      void queryClient.invalidateQueries({ queryKey: ["cv-inputs", userId] });
    },
  });
  const applyAi = useMutation({
    mutationFn: async () => {
      const combinedInstruction = [
        targetRole.trim() ? `Tailor this CV for the target role: ${targetRole.trim()}.` : "",
        instruction.trim(),
      ].filter(Boolean).join("\n");
      const consumedImportWorkflow = Boolean(state.importWorkflowId && state.importedOriginalCv);
      const result = consumedImportWorkflow
        ? await api.improveImportedCv({
          cv: state.cv,
          originalCv: state.importedOriginalCv!,
          importWorkflowId: state.importWorkflowId!,
          targetRole: targetRole.trim() || undefined,
          instruction: combinedInstruction,
          jobDescription: jobDescription.trim() || undefined,
          language: cvLanguage,
        })
        : await api.modifyCv({
          cv: state.cv,
          instruction: combinedInstruction,
          jobDescription: jobDescription.trim() || undefined,
          language: cvLanguage,
        });
      const preview = await api.renderCv({ cv: result.cv, language: cvLanguage, template: state.choice.template, style: state.choice.style });
      return { cv: result.cv, html: preview.html, consumedImportWorkflow };
    },
    onSuccess: (result) => dispatch({ type: "aiApplied", ...result }),
  });
  const undoAi = useMutation({
    mutationFn: async () => {
      if (!state.previousCv) throw new Error("No AI result to undo");
      const preview = await api.renderCv({ cv: state.previousCv, language: cvLanguage, template: state.choice.template, style: state.choice.style });
      return preview.html;
    },
    onSuccess: (html) => dispatch({ type: "undoAi", html }),
  });
  const saveCurrentCv = useMutation({
    mutationFn: () => api.saveCv({
      id: savedCvId ?? undefined,
      name: cvName.trim(),
      sourceType: savedCvId ? "edit" : state.importedOriginalCv ? "import" : "output",
      sourceInput: importText.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      cv: state.cv,
      html: state.html,
      language: cvLanguage,
      template: state.choice.template,
      style: state.choice.style,
    }),
    onSuccess: async ({ cv }) => {
      setSavedCvId(cv.id);
      try {
        if (userId) clearDraft(window.localStorage, userId);
        setDraftError(false);
      } catch {
        setDraftError(true);
      }
      await queryClient.invalidateQueries({ queryKey: ["cvs", userId] });
    },
  });

  function useSavedInput(input: CvInputRecord) {
    setSourceMode("import");
    setImportText(input.content);
    setImportName(input.name);
    setCvName(input.name);
    setSavedCvId(null);
    dispatch({ type: "goTo", step: "source" });
  }

  function useSavedCv(record: SavedCvRecord) {
    dispatch({ type: "loadSavedCv", cv: record.cv, html: record.html, template: record.template, style: record.style });
    setCvName(record.name);
    setSavedCvId(record.id);
    setCvLanguage(record.language);
    setImportText(record.sourceInput ?? "");
    setTargetRole(record.targetRole ?? "");
    setJobDescription("");
    setInstruction("");
    setHighlights(record.cv.experience?.[0]?.description?.join("\n") ?? "");
  }

  async function selectPdf(file: File | undefined) {
    if (!file) return;
    setFileError("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setFileError(messages.pdfOnly);
      return;
    }
    setIsExtracting(true);
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) throw new Error("empty_pdf");
      if (text.length > 200_000) throw new Error("pdf_too_long");
      setImportText(text);
      setImportName(file.name.replace(/\.pdf$/i, ""));
    } catch {
      setFileError(messages.pdfReadError);
    } finally {
      setIsExtracting(false);
    }
  }

  function updatePersonal(field: keyof CvData["personal_info"], value: string) {
    dispatch({
      type: "updateCv",
      cv: { ...state.cv, personal_info: { ...state.cv.personal_info, [field]: value } },
    });
  }

  function selectPhoto(dataUrl: string | undefined) {
    const { photo_url: _removed, ...rest } = state.cv.personal_info;
    dispatch({
      type: "updateCv",
      cv: {
        ...state.cv,
        personal_info: dataUrl ? { ...rest, photo_url: dataUrl } : rest,
      },
    });
  }

  function updateExperience(field: "role" | "company", value: string) {
    const experience = state.cv.experience?.[0] ?? blankExperience;
    dispatch({ type: "updateCv", cv: { ...state.cv, experience: [{ ...experience, [field]: value }] } });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const experience = state.cv.experience?.[0] ?? blankExperience;
    const preparedCv = {
      ...state.cv,
      experience: [{ ...experience, description: highlights.split("\n").map((line) => line.trim()).filter(Boolean) }],
    };
    dispatch({ type: "updateCv", cv: preparedCv });
    render.mutate({
      cv: preparedCv,
      language: cvLanguage,
      template: state.choice.template,
      style: state.choice.style,
    });
  }

  return (
    <main className="wizard" id="editor">
      {pendingDraft && <aside className="draft-banner" aria-labelledby="draft-title">
        <div><strong id="draft-title">{messages.draftTitle}</strong><p>{messages.draftBody}</p></div>
        <div><button type="button" className="secondary" onClick={discardPendingDraft}>{messages.discardDraft}</button><button type="button" onClick={restorePendingDraft}>{messages.restoreDraft}</button></div>
      </aside>}
      {draftError && <p className="error draft-error" role="alert">{messages.draftError}</p>}
      {!pendingDraft && <CvLibrary api={api} locale={locale} messages={messages} userId={userId} onUseInput={useSavedInput} onUseCv={useSavedCv} />}
      <nav className="wizard-steps" aria-label={messages.wizardProgress}>
        {WIZARD_STEPS.map((step, index) => (
          <button
            type="button"
            key={step}
            className={state.step === step ? "active" : ""}
            disabled={index > state.maxStep}
            aria-current={state.step === step ? "step" : undefined}
            onClick={() => dispatch({ type: "goTo", step })}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>{stepLabel(step, messages)}
          </button>
        ))}
      </nav>

      {state.step === "template" && (
        <section className="wizard-panel">
          <header className="section-heading"><span>01</span><div><h2>{messages.chooseTemplate}</h2><p>{messages.chooseTemplateHint}</p></div></header>
          <div className="template-grid">
            {TEMPLATE_CHOICES.map((choice) => (
              <label className={`template-card ${state.choice.id === choice.id ? "selected" : ""}`} key={choice.id}>
                <input
                  type="radio"
                  name="template"
                  value={choice.id}
                  checked={state.choice.id === choice.id}
                  onChange={() => dispatch({ type: "selectTemplate", choice })}
                />
                <span className={`template-swatch ${choice.template}`} aria-hidden="true"><i /><i /><i /></span>
                <strong>{templateName(choice.style, messages)}</strong>
                <small>{choice.template === "cv_sidebar" ? messages.sidebarLayout : messages.standardLayout}</small>
              </label>
            ))}
          </div>
          <WizardActions onNext={() => dispatch({ type: "goTo", step: "source" })} messages={messages} />
        </section>
      )}

      {state.step === "source" && (
        <section className="wizard-panel source-panel">
          <header className="section-heading"><span>02</span><div><h2>{messages.editor}</h2><p>{messages.editorHint}</p></div></header>
          <div className="source-tabs" role="tablist" aria-label={messages.sourceMethod}>
            <button type="button" role="tab" aria-selected={sourceMode === "manual"} onClick={() => setSourceMode("manual")}>{messages.manualEntry}</button>
            <button type="button" role="tab" aria-selected={sourceMode === "import"} onClick={() => setSourceMode("import")}>{messages.importCv}</button>
          </div>
          {sourceMode === "manual" ? <form onSubmit={submit}>
            <div className="field-grid">
              <Field label={messages.fullName} value={state.cv.personal_info.full_name} required onChange={(value) => updatePersonal("full_name", value)} />
              <Field label={messages.professionalTitle} value={state.cv.personal_info.title ?? ""} onChange={(value) => updatePersonal("title", value)} />
              <Field label={messages.email} value={state.cv.personal_info.email ?? ""} type="email" onChange={(value) => updatePersonal("email", value)} />
              <Field label={messages.phone} value={state.cv.personal_info.phone ?? ""} onChange={(value) => updatePersonal("phone", value)} />
              <Field label={messages.location} value={state.cv.personal_info.location ?? ""} onChange={(value) => updatePersonal("location", value)} />
            </div>
            <label>{messages.summary}<textarea value={state.cv.summary ?? ""} rows={4} onChange={(event) => dispatch({ type: "updateCv", cv: { ...state.cv, summary: event.target.value } })} /></label>
            <div className="field-grid">
              <Field label={messages.role} value={state.cv.experience?.[0]?.role ?? ""} onChange={(value) => updateExperience("role", value)} />
              <Field label={messages.company} value={state.cv.experience?.[0]?.company ?? ""} onChange={(value) => updateExperience("company", value)} />
            </div>
            <label>{messages.roleDescription}<textarea value={highlights} rows={4} onChange={(event) => setHighlights(event.target.value)} /></label>
            <div className="wizard-actions">
              <button className="secondary" type="button" onClick={() => dispatch({ type: "goTo", step: "template" })}>{messages.back}</button>
              <button type="submit" disabled={render.isPending}>{render.isPending ? messages.rendering : messages.render}</button>
            </div>
            {render.isError && <p className="error" role="alert">{messages.renderError}</p>}
          </form> : <form onSubmit={(event) => {
            event.preventDefault();
            const description = importText.trim();
            if (description) importCv.mutate({ description, name: importName || undefined });
          }}>
            <label className="pdf-drop">
              <span>{isExtracting ? messages.extractingPdf : messages.uploadPdf}</span>
              <small>{messages.uploadPdfHint}</small>
              <input type="file" accept="application/pdf,.pdf" disabled={isExtracting || importCv.isPending} onChange={(event) => void selectPdf(event.target.files?.[0])} />
            </label>
            <label>{messages.pasteCvText}
              <textarea value={importText} maxLength={200_000} rows={14} onChange={(event) => {
                setImportText(event.target.value);
                setFileError("");
              }} />
            </label>
            <div className="character-count">{importText.length.toLocaleString(locale)} / 200,000</div>
            <div className="wizard-actions">
              <button className="secondary" type="button" onClick={() => dispatch({ type: "goTo", step: "template" })}>{messages.back}</button>
              <button type="submit" disabled={!importText.trim() || isExtracting || importCv.isPending}>{importCv.isPending ? messages.importingCv : messages.importWithAi}</button>
            </div>
            {fileError && <p className="error" role="alert">{fileError}</p>}
            {importCv.isError && <p className="error" role="alert">{messages.importError}</p>}
          </form>}
        </section>
      )}

      {state.step === "preview" && (
        <section className="wizard-panel preview-panel" aria-labelledby="preview-title">
          <header className="section-heading preview-heading"><span>03</span><div><h2 id="preview-title">{messages.preview}</h2><p>{messages.previewHint}</p></div></header>
          {state.previewStale && <p className="notice">{messages.previewStale}</p>}
          <div className="preview-frame">
            {state.html ? <iframe title={messages.preview} sandbox="" srcDoc={state.html} /> : <p className="empty-preview">{messages.emptyPreview}</p>}
          </div>
          <WizardActions
            onBack={() => dispatch({ type: "goTo", step: "source" })}
            onNext={() => dispatch({ type: "goTo", step: "improve" })}
            messages={messages}
          />
        </section>
      )}

      {state.step === "improve" && (
        <section className="wizard-panel improve-panel">
          <header className="section-heading"><span>04</span><div><h2>{messages.improve}</h2><p>{messages.improveHint}</p></div></header>
          <div className="improve-grid">
            <form onSubmit={(event) => {
              event.preventDefault();
              if (targetRole.trim() || instruction.trim()) applyAi.mutate();
            }}>
              {state.importWorkflowId && <p className="allowance-note">{messages.importExtraUse}</p>}
              <Field label={messages.cvName} value={cvName} onChange={setCvName} />
              <label>{messages.cvLanguage}<select value={cvLanguage} onChange={(event) => setCvLanguage(event.target.value as Locale)}><option value="en">English</option><option value="es">Español</option></select></label>
              <Field label={messages.targetRole} value={targetRole} onChange={setTargetRole} />
              <label>{messages.jobDescription}<textarea rows={6} value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} /></label>
              <label>{messages.instruction}<textarea rows={4} value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
              <PhotoManager
                api={api}
                messages={messages}
                userId={userId}
                selectedPhotoUrl={state.cv.personal_info.photo_url}
                onSelect={selectPhoto}
              />
              <p className="photo-note">{messages.photoSidebarNote}</p>
              <div className="wizard-actions improve-actions">
                <button className="secondary" type="button" onClick={() => undoAi.mutate()} disabled={!state.previousCv || undoAi.isPending}>{messages.undoAi}</button>
                <button type="submit" disabled={(!targetRole.trim() && !instruction.trim()) || applyAi.isPending}>{applyAi.isPending ? messages.applyingAi : messages.applyAll}</button>
              </div>
              {(applyAi.isError || undoAi.isError) && <p className="error" role="alert">{messages.aiError}</p>}
              <div className="save-row"><button type="button" disabled={!cvName.trim() || !state.html || saveCurrentCv.isPending} onClick={() => saveCurrentCv.mutate()}>{saveCurrentCv.isPending ? messages.savingCv : messages.saveCv}</button></div>
              {saveCurrentCv.isSuccess && <p className="success" role="status">{messages.cvSaved}</p>}
              {saveCurrentCv.isError && <p className="error" role="alert">{messages.saveCvError}</p>}
            </form>
            <div className="final-preview preview-frame"><iframe title={messages.finalPreview} sandbox="" srcDoc={state.html} /></div>
          </div>
          <WizardActions onBack={() => dispatch({ type: "goTo", step: "preview" })} messages={messages} />
        </section>
      )}
    </main>
  );
}

function stepLabel(step: WizardStep, messages: Messages): string {
  return { template: messages.stepTemplate, source: messages.stepSource, preview: messages.stepPreview, improve: messages.stepImprove }[step];
}

function templateName(style: CvStyle, messages: Messages): string {
  return {
    sidebar_green: messages.templateSidebarGreen,
    sidebar_compact: messages.templateSidebarCompact,
    modern: messages.templateModern,
    minimal: messages.templateMinimal,
    classic: messages.templateClassic,
    executive: messages.templateExecutive,
  }[style];
}

function WizardActions({ messages, onBack, onNext }: { messages: Messages; onBack?: () => void; onNext?: () => void }) {
  return <div className="wizard-actions">
    {onBack && <button className="secondary" type="button" onClick={onBack}>{messages.back}</button>}
    {onNext && <button type="button" onClick={onNext}>{messages.continue}</button>}
  </div>;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}

function Field({ label, value, onChange, required, type = "text" }: FieldProps) {
  return <label>{label}<input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}
