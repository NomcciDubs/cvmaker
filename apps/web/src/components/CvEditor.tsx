import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { CvmakerApi } from "../api/cvmaker";
import type { Messages } from "../i18n/messages";
import type { CvData, CvTemplate, Locale, RenderCvRequest } from "../types";

interface CvEditorProps {
  api: CvmakerApi;
  locale: Locale;
  messages: Messages;
}

const blankCv: CvData = {
  personal_info: { full_name: "", title: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  experience: [{ role: "", company: "", location: "", start_date: "", end_date: "", description: [] }],
  education: [],
  skills: [],
  languages: [],
};

export function CvEditor({ api, locale, messages }: CvEditorProps) {
  const [cv, setCv] = useState<CvData>(blankCv);
  const [highlights, setHighlights] = useState("");
  const [template, setTemplate] = useState<CvTemplate>("cv_sidebar");
  const [html, setHtml] = useState("");
  const render = useMutation({
    mutationFn: (body: RenderCvRequest) => api.renderCv(body),
    onSuccess: (data) => setHtml(data.html),
  });

  function updatePersonal(field: keyof CvData["personal_info"], value: string) {
    setCv((current) => ({
      ...current,
      personal_info: { ...current.personal_info, [field]: value },
    }));
  }

  function updateExperience(field: "role" | "company", value: string) {
    setCv((current) => ({
      ...current,
      experience: [{ ...current.experience[0]!, [field]: value }],
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preparedCv = {
      ...cv,
      experience: [{ ...cv.experience[0]!, description: highlights.split("\n").map((line) => line.trim()).filter(Boolean) }],
    };
    render.mutate({
      cv: preparedCv,
      language: locale,
      template,
      style: template === "cv_sidebar" ? "sidebar_green" : "modern",
    });
  }

  return (
    <main className="workspace" id="editor">
      <section className="editor-panel">
        <header className="section-heading">
          <span>01</span>
          <div><h2>{messages.editor}</h2><p>{messages.editorHint}</p></div>
        </header>
        <form onSubmit={submit}>
          <div className="field-grid">
            <Field label={messages.fullName} value={cv.personal_info.full_name} required onChange={(value) => updatePersonal("full_name", value)} />
            <Field label={messages.professionalTitle} value={cv.personal_info.title} onChange={(value) => updatePersonal("title", value)} />
            <Field label={messages.email} value={cv.personal_info.email} type="email" onChange={(value) => updatePersonal("email", value)} />
            <Field label={messages.phone} value={cv.personal_info.phone} onChange={(value) => updatePersonal("phone", value)} />
            <Field label={messages.location} value={cv.personal_info.location} onChange={(value) => updatePersonal("location", value)} />
          </div>
          <label>{messages.summary}<textarea value={cv.summary} rows={4} onChange={(event) => setCv({ ...cv, summary: event.target.value })} /></label>
          <div className="field-grid">
            <Field label={messages.role} value={cv.experience[0]!.role} onChange={(value) => updateExperience("role", value)} />
            <Field label={messages.company} value={cv.experience[0]!.company} onChange={(value) => updateExperience("company", value)} />
          </div>
          <label>{messages.roleDescription}<textarea value={highlights} rows={4} onChange={(event) => setHighlights(event.target.value)} /></label>
          <div className="form-footer">
            <label className="select-field">{messages.template}
              <select value={template} onChange={(event) => setTemplate(event.target.value as CvTemplate)}>
                <option value="cv_sidebar">{messages.sidebar}</option>
                <option value="cv_base">{messages.standard}</option>
              </select>
            </label>
            <button type="submit" disabled={render.isPending}>{render.isPending ? messages.rendering : messages.render}</button>
          </div>
          {render.isError && <p className="error" role="alert">{messages.renderError}</p>}
        </form>
      </section>
      <section className="preview-panel" aria-labelledby="preview-title">
        <header className="section-heading preview-heading">
          <span>02</span>
          <div><h2 id="preview-title">{messages.preview}</h2><p>{messages.previewHint}</p></div>
        </header>
        <div className="preview-frame">
          {html
            ? <iframe title={messages.preview} sandbox="" srcDoc={html} />
            : <p className="empty-preview">{messages.emptyPreview}</p>}
        </div>
      </section>
    </main>
  );
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
