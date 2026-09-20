import { useEffect, useReducer, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { normalizeCvLinks, resolveCvLanguage, type CvData, type CvLanguage } from "@nomcci/cvmaker-domain";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { CvInputRecord, CvStyle, Locale, RenderCvRequest, SavedCvRecord } from "../types";
import { extractPdfText } from "../pdf-import";
import { clearDraft, loadDraft, saveDraft, type CvDraftData } from "../draft-store";
import { createWizardState, TEMPLATE_CHOICES, WIZARD_STEPS, wizardReducer, type WizardStep } from "../wizard";
import { AdminPanel } from "./AdminPanel";
import { CvForm } from "./CvForm";
import { ApplicationTracker } from "./ApplicationTracker";
import { CvLibrary } from "./CvLibrary";
import { CvPreview, type PreviewMode } from "./CvPreview";
import { PdfArchives, PdfExportButton } from "./PdfArchives";
import { PhotoManager } from "./PhotoManager";
import { FieldTile } from "./ui/FieldTile";
import { Icon } from "./ui/Icon";
import { LanguageCombobox } from "./ui/LanguageCombobox";
import { Segmented } from "./ui/Segmented";
import { Sheet } from "./ui/Sheet";

interface CvEditorProps {
  api: CvmakerApi;
  locale: Locale;
  messages: Messages;
  userId?: string;
  userRole?: string;
  toolsOpen?: boolean;
  onCloseTools?: () => void;
}

function transitionWithViewUpdate(callback: () => void): boolean {
  if (typeof document.startViewTransition !== "function") return false;
  document.startViewTransition(callback);
  return true;
}

export function CvEditor({ api, locale, messages, userId, userRole, toolsOpen = false, onCloseTools }: CvEditorProps) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(wizardReducer, locale, createWizardState);
  const [sourceMode, setSourceMode] = useState<"manual" | "import">("manual");
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [fileError, setFileError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [pdfDragging, setPdfDragging] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [instruction, setInstruction] = useState("");
  const [documentLanguage, setDocumentLanguage] = useState<CvLanguage>(() => resolveCvLanguage(locale));
  const [aiTargetLanguage, setAiTargetLanguage] = useState<CvLanguage>(() => resolveCvLanguage(locale));
  const [cvName, setCvName] = useState("");
  const [savedCvId, setSavedCvId] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CvDraftData | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [draftUserId, setDraftUserId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("actual");
  const [stageDirection, setStageDirection] = useState<"forward" | "back">("forward");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<WizardStep>(state.step);

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
    setDocumentLanguage(resolveCvLanguage(locale));
    setAiTargetLanguage(resolveCvLanguage(locale));
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
        documentLanguage,
        aiTargetLanguage,
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
  }, [aiTargetLanguage, cvName, documentLanguage, draftReady, draftUserId, importName, importText, instruction, jobDescription, pendingDraft, savedCvId, sourceMode, state, targetRole, userId]);

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
    setDocumentLanguage(pendingDraft.documentLanguage);
    setAiTargetLanguage(pendingDraft.aiTargetLanguage);
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

  function transitionToStep(step: WizardStep) {
    const applied = transitionWithViewUpdate(() => {
      flushSync(() => {
        dispatch({ type: "goTo", step });
      });
    });
    if (!applied) dispatch({ type: "goTo", step });
  }

  useEffect(() => {
    if (previousStepRef.current === state.step) return;
    const previousIndex = WIZARD_STEPS.indexOf(previousStepRef.current);
    setStageDirection(WIZARD_STEPS.indexOf(state.step) > previousIndex ? "forward" : "back");
    previousStepRef.current = state.step;
    stepHeadingRef.current?.focus();
  }, [state.step]);

  useEffect(() => {
    render.reset();
    importCv.reset();
    setFileError("");
  }, [state.step]);

  const render = useMutation({
    mutationFn: (body: RenderCvRequest) => api.renderCv(body),
  });

  function renderPreview(body: RenderCvRequest, keepStep = false) {
    render.mutate(body, {
      onSuccess: (data) => dispatch({ type: "rendered", html: data.html, language: body.language, keepStep }),
    });
  }
  const importCv = useMutation({
    mutationFn: async ({ description, name }: { description: string; name?: string }) => {
      await api.saveCvInput({ content: description, name });
      const imported = await api.importCv({ description, language: documentLanguage });
      const preview = await api.renderCv({
        cv: imported.cv,
        language: documentLanguage,
        template: state.choice.template,
        style: state.choice.style,
      });
      return { ...imported, html: preview.html };
    },
    onSuccess: (result) => {
      dispatch({ type: "imported", cv: result.cv, importWorkflowId: result.importWorkflowId });
      dispatch({ type: "rendered", html: result.html, language: documentLanguage });
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
          language: aiTargetLanguage,
        })
        : await api.modifyCv({
          cv: state.cv,
          instruction: combinedInstruction,
          jobDescription: jobDescription.trim() || undefined,
          language: aiTargetLanguage,
        });
      const preview = await api.renderCv({ cv: result.cv, language: aiTargetLanguage, template: state.choice.template, style: state.choice.style });
      return { cv: result.cv, html: preview.html, consumedImportWorkflow };
    },
    onSuccess: (result) => dispatch({ type: "aiApplied", ...result, language: aiTargetLanguage }),
  });
  const undoAi = useMutation({
    mutationFn: async () => {
      if (!state.previousCv) throw new Error("No AI result to undo");
      const preview = await api.renderCv({
        cv: state.previousCv,
        language: state.previousLanguage ?? state.documentLanguage,
        template: state.choice.template,
        style: state.choice.style,
      });
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
      language: state.documentLanguage,
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
    transitionToStep("source");
    onCloseTools?.();
  }

  function useSavedCv(record: SavedCvRecord) {
    const cv: CvData = {
      ...record.cv,
      personal_info: { ...record.cv.personal_info, links: normalizeCvLinks(record.cv.personal_info.links) },
    };
    dispatch({ type: "loadSavedCv", cv, html: record.html, template: record.template, style: record.style, language: record.language });
    setCvName(record.name);
    setSavedCvId(record.id);
    setDocumentLanguage(record.language);
    setAiTargetLanguage(record.language);
    setImportText(record.sourceInput ?? "");
    setTargetRole(record.targetRole ?? "");
    setJobDescription("");
    setInstruction("");
    onCloseTools?.();
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    renderPreview({
      cv: state.cv,
      language: documentLanguage,
      template: state.choice.template,
      style: state.choice.style,
    });
  }

  function regenerate(keepStep = false) {
    renderPreview(
      {
        cv: state.cv,
        language: state.documentLanguage,
        template: state.choice.template,
        style: state.choice.style,
      },
      keepStep,
    );
  }

  const stepIndex = WIZARD_STEPS.indexOf(state.step);
  const navStyle = { "--nav-index": stepIndex, "--nav-count": WIZARD_STEPS.length } as CSSProperties;
  const personName = state.cv.personal_info.full_name.trim();
  const docStatus = state.previewStale && state.html ? "pending" : savedCvId ? "saved" : "draft";
  const statusLabel = docStatus === "pending"
    ? messages.mastheadStatusPending
    : docStatus === "saved"
      ? messages.mastheadStatusSaved
      : messages.mastheadStatusDraft;
  const stepOf = messages.stepOf
    .replace("{current}", String(stepIndex + 1))
    .replace("{total}", String(WIZARD_STEPS.length));
  const stale = state.previewStale;
  const tile = { closeLabel: messages.close, doneLabel: messages.done };

  return (
    <main className="workspace" id="editor">
      <header className="masthead" aria-labelledby="doc-title">
        <div className="masthead-doc">
          <h1 className="masthead-title" id="doc-title">{cvName.trim() || messages.unnamedCv}</h1>
          <p className="masthead-meta">
            {personName ? <span className="masthead-person">{personName}</span> : null}
            <span className="masthead-status" data-status={docStatus}>{statusLabel}</span>
          </p>
        </div>
        <div className="masthead-step">
          <span className="masthead-step-count">{stepOf}</span>
          <span className="masthead-step-name">{stepLabel(state.step, messages)}</span>
        </div>
      </header>

      <Sheet
        open={Boolean(pendingDraft)}
        onClose={() => {}}
        dismissable={false}
        title={messages.draftTitle}
        variant="center"
        closeLabel={messages.close}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={discardPendingDraft}>{messages.discardDraft}</button>
            <button type="button" className="btn btn-primary" data-autofocus onClick={restorePendingDraft}>{messages.restoreDraft}</button>
          </>
        }
      >
        <p>{messages.draftBody}</p>
      </Sheet>
      {draftError && <p className="error draft-error" role="alert">{messages.draftError}</p>}

      <nav className="wizard-nav" style={navStyle} aria-label={messages.wizardProgress}>
        <span className="wizard-nav-indicator" aria-hidden="true" />
        {WIZARD_STEPS.map((step, index) => {
          const current = state.step === step;
          const done = index < state.maxStep && !current;
          const locked = index > state.maxStep;
          const stepState = current ? "current" : done ? "done" : locked ? "locked" : "available";
          const label = stepLabel(step, messages);
          return (
            <button
              type="button"
              key={step}
              className="wizard-step"
              data-active={current ? "true" : undefined}
              data-state={stepState}
              disabled={locked}
              aria-current={current ? "step" : undefined}
              aria-label={locked ? `${label} (${messages.stepLocked})` : undefined}
              onClick={() => transitionToStep(step)}
            >
              <span className="wizard-step-num">
                {done ? <Icon name="check" size={14} /> : String(index + 1).padStart(2, "0")}
              </span>
              <span className="wizard-step-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="step-stage" data-direction={stageDirection}>
        {state.step === "template" && (
          <section className="step-panel" aria-labelledby="step-template-title">
            <header className="step-head">
              <div>
                <h2 id="step-template-title" ref={stepHeadingRef} tabIndex={-1}>{messages.chooseTemplate}</h2>
                <p>{messages.chooseTemplateHint}</p>
              </div>
            </header>
            <div className="step-body">
              <div className="template-grid">
                {TEMPLATE_CHOICES.map((choice) => {
                  const selected = state.choice.id === choice.id;
                  return (
                    <label className="template-card" data-selected={selected ? "true" : undefined} key={choice.id}>
                      <input
                        type="radio"
                        name="template"
                        value={choice.id}
                        checked={selected}
                        onChange={() => dispatch({ type: "selectTemplate", choice })}
                      />
                      <span className={`template-swatch template-swatch--${choice.style}`} aria-hidden="true">
                        <span className="sw-head">
                          <span className="sw-photo" />
                          <span className="sw-title" />
                        </span>
                        <span className="sw-body">
                          <span className="sw-aside" />
                          <span className="sw-main">
                            <span className="sw-line" />
                            <span className="sw-line" />
                            <span className="sw-line sw-short" />
                            <span className="sw-line" />
                          </span>
                        </span>
                      </span>
                      <span className="template-meta">
                        <span>
                          <strong>{templateName(choice.style, messages)}</strong>
                          <small>{choice.template === "cv_sidebar" ? messages.sidebarLayout : messages.standardLayout}</small>
                        </span>
                        <span className="template-check" aria-hidden="true"><Icon name="check" size={15} /></span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <WizardActions sticky onNext={() => transitionToStep("source")} messages={messages} />
            </div>
          </section>
        )}

        {state.step === "source" && (
          <section className="step-panel" aria-labelledby="step-source-title">
            <header className="step-head">
              <div>
                <h2 id="step-source-title" ref={stepHeadingRef} tabIndex={-1}>{messages.editor}</h2>
                <p>{messages.editorHint}</p>
              </div>
            </header>
            <div className="step-body">
              <div className="source-tabs-wrap">
                <Segmented
                  tabs
                  id="source-method"
                  panelId="source-panel"
                  className="source-tabs"
                  ariaLabel={messages.sourceMethod}
                  value={sourceMode}
                  onChange={setSourceMode}
                  options={[
                    { value: "manual", label: messages.manualEntry },
                    { value: "import", label: messages.importCv },
                  ]}
                />
              </div>
              <div
                className="source-panel"
                id="source-panel"
                role="tabpanel"
                aria-labelledby={`source-method-${sourceMode}`}
                tabIndex={0}
              >
              {sourceMode === "manual" ? <form onSubmit={submit}>
                <CvForm cv={state.cv} messages={messages} onChange={(cv) => dispatch({ type: "updateCv", cv })} />
                <div className="wizard-actions wizard-actions-sticky">
                  <button className="btn btn-secondary" type="button" onClick={() => transitionToStep("template")}>{messages.back}</button>
                  <button className="btn btn-primary" type="submit" disabled={render.isPending}>{render.isPending ? messages.rendering : messages.render}</button>
                </div>
                {render.isError && <p className="error" role="alert">{messages.renderError}</p>}
              </form> : <form onSubmit={(event) => {
                event.preventDefault();
                const description = importText.trim();
                if (description) importCv.mutate({ description, name: importName || undefined });
              }}>
                <div className="import-steps">
                  <div className="import-step">
                    <span className="import-step-index" aria-hidden="true">01</span>
                    <label
                      className="pdf-drop"
                      data-dragging={pdfDragging ? "true" : undefined}
                      onDragOver={(event) => { event.preventDefault(); setPdfDragging(true); }}
                      onDragLeave={() => setPdfDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setPdfDragging(false);
                        void selectPdf(event.dataTransfer.files?.[0]);
                      }}
                    >
                      <span>{isExtracting ? messages.extractingPdf : messages.uploadPdf}</span>
                      <small>{messages.uploadPdfHint}</small>
                      <input type="file" accept="application/pdf,.pdf" disabled={isExtracting || importCv.isPending} onChange={(event) => void selectPdf(event.target.files?.[0])} />
                    </label>
                  </div>
                  <div className="import-step">
                    <span className="import-step-index" aria-hidden="true">02</span>
                    <div className="import-step-body">
                      <label className="field"><span className="field-label">{messages.pasteCvText}</span>
                        <textarea value={importText} maxLength={200_000} rows={14} onChange={(event) => {
                          setImportText(event.target.value);
                          setFileError("");
                        }} />
                      </label>
                      <div className="character-count">{importText.length.toLocaleString(locale)} / 200,000</div>
                    </div>
                  </div>
                </div>
                <div className="wizard-actions wizard-actions-sticky">
                  <button className="btn btn-secondary" type="button" onClick={() => transitionToStep("template")}>{messages.back}</button>
                  <button className="btn btn-primary" type="submit" disabled={!importText.trim() || isExtracting || importCv.isPending}>{importCv.isPending ? messages.importingCv : messages.importWithAi}</button>
                </div>
                {fileError && <p className="error" role="alert">{fileError}</p>}
                {importCv.isError && <p className="error" role="alert">{messages.importError}</p>}
              </form>}
              </div>
            </div>
          </section>
        )}

        {state.step === "preview" && (
          <section className="step-panel preview-panel" aria-labelledby="step-preview-title">
            <header className="step-head">
              <div>
                <h2 id="step-preview-title" ref={stepHeadingRef} tabIndex={-1}>{messages.preview}</h2>
                <p>{messages.previewHint}</p>
              </div>
            </header>
            <div className="step-body">
              <div className="preview-toolbar">
                <span className="preview-toolbar-label">{messages.previewZoomLabel}</span>
                <Segmented
                  className="zoom-switch"
                  ariaLabel={messages.previewZoomLabel}
                  value={previewMode}
                  onChange={setPreviewMode}
                  options={[
                    { value: "actual", label: messages.zoomActual },
                    { value: "fullscreen", label: messages.fullscreen },
                  ]}
                />
              </div>
              {stale && (
                <StaleNotice messages={messages} regenerating={render.isPending} onRegenerate={regenerate} />
              )}
              {render.isError && <p className="error" role="alert">{messages.renderError}</p>}
              <CvPreview
                html={state.html}
                title={messages.preview}
                mode={previewMode}
                emptyLabel={messages.emptyPreview}
                fullscreenLabel={messages.fullscreenPreview}
                exitFullscreenLabel={messages.exitFullscreen}
                onExitFullscreen={() => setPreviewMode("actual")}
              />
              <WizardActions
                sticky
                onBack={() => transitionToStep("source")}
                onNext={() => transitionToStep("improve")}
                nextDisabled={stale || !state.html}
                messages={messages}
              />
            </div>
          </section>
        )}

        {state.step === "improve" && (
          <section className="step-panel" aria-labelledby="step-improve-title">
            <header className="step-head">
              <div>
                <h2 id="step-improve-title" ref={stepHeadingRef} tabIndex={-1}>{messages.improve}</h2>
                <p>{messages.improveHint}</p>
              </div>
            </header>
            <div className="step-body">
              <div className="improve-grid">
                <form onSubmit={(event) => {
                  event.preventDefault();
                  if (targetRole.trim() || instruction.trim()) applyAi.mutate();
                }}>
                  {state.importWorkflowId && <p className="allowance-note">{messages.importExtraUse}</p>}
                  <div className="improve-task">
                    <h3 className="task-heading">{messages.aiTaskTitle}<span>{messages.aiTaskHint}</span></h3>
                    <FieldTile {...tile} label={messages.targetRole} value={targetRole} onChange={setTargetRole} />
                    <FieldTile {...tile} label={messages.jobDescription} value={jobDescription} multiline rows={8} onChange={setJobDescription} />
                    <FieldTile {...tile} label={messages.instruction} value={instruction} multiline rows={6} onChange={setInstruction} />
                    <LanguageCombobox
                      value={aiTargetLanguage}
                      onChange={setAiTargetLanguage}
                      locale={locale}
                      messages={messages}
                      label={messages.aiTargetLanguageLabel}
                      hint={messages.aiTargetLanguageHint}
                    />
                    <div className="wizard-actions improve-actions wizard-actions-sticky">
                      <button className="btn btn-secondary" type="button" onClick={() => undoAi.mutate()} disabled={!state.previousCv || undoAi.isPending}>{messages.undoAi}</button>
                      <button className="btn btn-primary" type="submit" disabled={(!targetRole.trim() && !instruction.trim()) || applyAi.isPending}>{applyAi.isPending ? messages.applyingAi : messages.applyAll}</button>
                    </div>
                    {(applyAi.isError || undoAi.isError) && <p className="error" role="alert">{messages.aiError}</p>}
                  </div>
                  <div className="presentation-task">
                    <h3 className="task-heading">{messages.presentationTaskTitle}<span>{messages.presentationTaskHint}</span></h3>
                    <FieldTile {...tile} label={messages.cvName} value={cvName} onChange={setCvName} />
                    <PhotoManager
                      api={api}
                      messages={messages}
                      userId={userId}
                      selectedPhotoUrl={state.cv.personal_info.photo_url}
                      onSelect={selectPhoto}
                    />
                    <p className="photo-note">{messages.photoSidebarNote}</p>
                  </div>
                  <div className="finish-task">
                    <h3 className="task-heading">{messages.finishTaskTitle}<span>{messages.finishTaskHint}</span></h3>
                    {stale && (
                      <StaleNotice messages={messages} regenerating={render.isPending} onRegenerate={() => regenerate(true)} />
                    )}
                    {render.isError && <p className="error" role="alert">{messages.renderError}</p>}
                    <div className="save-row"><button type="button" className="btn btn-secondary" disabled={!cvName.trim() || !state.html || stale || saveCurrentCv.isPending} onClick={() => saveCurrentCv.mutate()}>{saveCurrentCv.isPending ? messages.savingCv : messages.saveCv}</button></div>
                    {saveCurrentCv.isSuccess && <p className="success" role="status">{messages.cvSaved}</p>}
                    {saveCurrentCv.isError && <p className="error" role="alert">{messages.saveCvError}</p>}
                    <PdfExportButton
                      api={api}
                      messages={messages}
                      userId={userId}
                      disabled={!state.html || stale}
                      snapshot={{
                        cv: state.cv,
                        language: state.documentLanguage,
                        template: state.choice.template,
                        style: state.choice.style,
                        name: cvName.trim() || undefined,
                      }}
                    />
                  </div>
                </form>
                <div className="final-preview">
                  <div className="preview-toolbar">
                    <span className="preview-toolbar-label">{messages.previewZoomLabel}</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-haspopup="dialog"
                      onClick={() => setPreviewMode("fullscreen")}
                    >
                      <Icon name="expand" size={16} />
                      {messages.fullscreen}
                    </button>
                  </div>
                  <CvPreview
                    html={state.html}
                    title={messages.finalPreview}
                    mode={previewMode}
                    emptyLabel={messages.emptyPreview}
                    fullscreenLabel={messages.fullscreenPreview}
                    exitFullscreenLabel={messages.exitFullscreen}
                    onExitFullscreen={() => setPreviewMode("actual")}
                  />
                </div>
              </div>
              <WizardActions onBack={() => transitionToStep("preview")} messages={messages} />
            </div>
          </section>
        )}
      </div>

      <Sheet
        open={Boolean(toolsOpen) && !pendingDraft}
        onClose={onCloseTools ?? (() => {})}
        title={messages.toolsTitle}
        description={messages.toolsHint}
        variant="side"
        closeLabel={messages.close}
      >
        <div className="tools-stack">
          <CvLibrary api={api} locale={locale} messages={messages} userId={userId} onUseInput={useSavedInput} onUseCv={useSavedCv} />
          <PdfArchives api={api} messages={messages} locale={locale} userId={userId} />
          <ApplicationTracker
            api={api}
            messages={messages}
            locale={locale}
            userId={userId}
            defaultRole={targetRole}
            snapshot={{
              cv: state.cv,
              html: state.html,
              language: state.documentLanguage,
              template: state.choice.template,
              style: state.choice.style,
              jobDescription: jobDescription.trim() || undefined,
            }}
          />
          <AdminPanel api={api} messages={messages} locale={locale} userRole={userRole} />
        </div>
      </Sheet>
      {(importCv.isPending || applyAi.isPending) && (
        <div className="ai-loading-overlay" role="status">
          <div className="ai-loading-card">
            <span className="ai-loading-spinner" aria-hidden="true" />
            <p>{importCv.isPending ? messages.importingCv : messages.applyingAi}</p>
          </div>
        </div>
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

function StaleNotice({ messages, regenerating, onRegenerate }: { messages: Messages; regenerating: boolean; onRegenerate: () => void }) {
  return (
    <div className="notice preview-stale" role="status">
      <span>{messages.previewStale}</span>
      <button type="button" className="btn btn-secondary" disabled={regenerating} onClick={onRegenerate}>
        {regenerating ? messages.rendering : messages.render}
      </button>
    </div>
  );
}

function WizardActions({ messages, onBack, onNext, nextDisabled, sticky }: { messages: Messages; onBack?: () => void; onNext?: () => void; nextDisabled?: boolean; sticky?: boolean }) {
  return <div className={`wizard-actions${sticky ? " wizard-actions-sticky" : ""}`}>
    {onBack && <button className="btn btn-secondary" type="button" onClick={onBack}>{messages.back}</button>}
    {onNext && <button className="btn btn-primary" type="button" disabled={nextDisabled} onClick={onNext}>{messages.continue}</button>}
  </div>;
}
