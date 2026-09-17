import { useReducer, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { CvData, CvStyle, Locale, RenderCvRequest } from "../types";
import { createWizardState, TEMPLATE_CHOICES, WIZARD_STEPS, wizardReducer, type WizardStep } from "../wizard";

interface CvEditorProps {
  api: CvmakerApi;
  locale: Locale;
  messages: Messages;
}

const blankExperience = { role: "", company: "", location: "", start_date: "", end_date: "", description: [] as string[] };

export function CvEditor({ api, locale, messages }: CvEditorProps) {
  const [state, dispatch] = useReducer(wizardReducer, undefined, createWizardState);
  const [highlights, setHighlights] = useState("");
  const render = useMutation({
    mutationFn: (body: RenderCvRequest) => api.renderCv(body),
    onSuccess: (data) => dispatch({ type: "rendered", html: data.html }),
  });

  function updatePersonal(field: keyof CvData["personal_info"], value: string) {
    dispatch({
      type: "updateCv",
      cv: { ...state.cv, personal_info: { ...state.cv.personal_info, [field]: value } },
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
      language: locale,
      template: state.choice.template,
      style: state.choice.style,
    });
  }

  return (
    <main className="wizard" id="editor">
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
          <form onSubmit={submit}>
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
          </form>
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
          <div className="coming-next"><p>{messages.improveFoundation}</p></div>
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
