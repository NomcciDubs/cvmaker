import type { CvData, Education, Experience, SkillGroup } from "@nomcci/cvmaker-domain";
import type { Messages } from "../i18n/messages";
import { FieldTile } from "./ui/FieldTile";

interface CvFormProps {
  cv: CvData;
  messages: Messages;
  onChange: (cv: CvData) => void;
}

const blankExperience = (): Experience => ({
  role: "",
  company: "",
  location: "",
  start_date: "",
  end_date: "",
  description: [],
});

const blankEducation = (): Education => ({
  degree: "",
  institution: "",
  location: "",
  start_date: "",
  end_date: "",
  details: [],
});

function splitLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function updateAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, current) => (current === index ? value : item));
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, current) => current !== index);
}

export function CvForm({ cv, messages, onChange }: CvFormProps) {
  const links = cv.personal_info.links ?? [];
  const experience = cv.experience ?? [];
  const education = cv.education ?? [];
  const skills = cv.skills ?? [];
  const languages = cv.languages ?? [];
  const tile = { closeLabel: messages.close, doneLabel: messages.done };

  function updatePersonal(field: keyof CvData["personal_info"], value: string) {
    onChange({ ...cv, personal_info: { ...cv.personal_info, [field]: value } });
  }

  return (
    <>
      <fieldset className="cv-subsection">
        <legend>{messages.personalDetails}</legend>
        <div className="field-grid">
          <Field label={messages.fullName} value={cv.personal_info.full_name} required name="full-name" autoComplete="name" onChange={(value) => updatePersonal("full_name", value)} />
          <Field label={messages.professionalTitle} value={cv.personal_info.title ?? ""} name="professional-title" autoComplete="organization-title" onChange={(value) => updatePersonal("title", value)} />
          <Field label={messages.email} value={cv.personal_info.email ?? ""} type="email" name="email" autoComplete="email" onChange={(value) => updatePersonal("email", value)} />
          <Field label={messages.phone} value={cv.personal_info.phone ?? ""} type="tel" name="phone" autoComplete="tel" inputMode="tel" onChange={(value) => updatePersonal("phone", value)} />
          <Field label={messages.location} value={cv.personal_info.location ?? ""} name="location" autoComplete="address-level2" onChange={(value) => updatePersonal("location", value)} />
        </div>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.links}</legend>
        {links.map((link, index) => (
          <div className="entry-card" key={index}>
            <div className="entry-head">
              <strong>{messages.links} {index + 1}</strong>
              <button type="button" className="danger-link" onClick={() => onChange({
                ...cv,
                personal_info: { ...cv.personal_info, links: removeAt(links, index) },
              })}>{messages.remove}</button>
            </div>
            <div className="field-grid">
              <Field label={messages.linkLabel} value={link.label} onChange={(value) => onChange({
                ...cv,
                personal_info: { ...cv.personal_info, links: updateAt(links, index, { ...link, label: value }) },
              })} />
              <FieldTile
                {...tile}
                label={messages.linkUrl}
                value={link.url}
                type="url"
                placeholder="https://"
                onChange={(value) => onChange({
                  ...cv,
                  personal_info: { ...cv.personal_info, links: updateAt(links, index, { ...link, url: value }) },
                })}
              />
            </div>
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({
          ...cv,
          personal_info: { ...cv.personal_info, links: [...links, { label: "", url: "" }] },
        })}>{messages.addLink}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.summary}</legend>
        <FieldTile
          {...tile}
          label={messages.summary}
          value={cv.summary ?? ""}
          multiline
          rows={6}
          onChange={(value) => onChange({ ...cv, summary: value })}
        />
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.experienceTitle}</legend>
        {experience.map((entry, index) => (
          <div className="entry-card" key={index}>
            <div className="entry-head">
              <strong>{messages.experienceTitle} {index + 1}</strong>
              <button type="button" className="danger-link" onClick={() => onChange({ ...cv, experience: removeAt(experience, index) })}>{messages.remove}</button>
            </div>
            <div className="field-grid">
              <Field label={messages.role} value={entry.role} autoComplete="organization-title" onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, role: value }) })} />
              <Field label={messages.company} value={entry.company} autoComplete="organization" onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, company: value }) })} />
            </div>
            <div className="field-grid" data-cols="3">
              <FieldTile {...tile} label={messages.location} value={entry.location ?? ""} onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, location: value }) })} />
              <FieldTile {...tile} label={messages.startDate} value={entry.start_date ?? ""} placeholder="2022" onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, start_date: value }) })} />
              <FieldTile {...tile} label={messages.endDate} value={entry.end_date ?? ""} placeholder="2024" onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, end_date: value }) })} />
            </div>
            <FieldTile
              {...tile}
              label={messages.roleDescription}
              value={(entry.description ?? []).join("\n")}
              multiline
              rows={6}
              onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, description: splitLines(value) }) })}
            />
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, experience: [...experience, blankExperience()] })}>{messages.addExperience}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.educationTitle}</legend>
        {education.map((entry, index) => (
          <div className="entry-card" key={index}>
            <div className="entry-head">
              <strong>{messages.educationTitle} {index + 1}</strong>
              <button type="button" className="danger-link" onClick={() => onChange({ ...cv, education: removeAt(education, index) })}>{messages.remove}</button>
            </div>
            <div className="field-grid">
              <Field label={messages.degree} value={entry.degree} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, degree: value }) })} />
              <Field label={messages.institution} value={entry.institution} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, institution: value }) })} />
            </div>
            <div className="field-grid" data-cols="3">
              <FieldTile {...tile} label={messages.location} value={entry.location ?? ""} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, location: value }) })} />
              <FieldTile {...tile} label={messages.startDate} value={entry.start_date ?? ""} placeholder="2018" onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, start_date: value }) })} />
              <FieldTile {...tile} label={messages.endDate} value={entry.end_date ?? ""} placeholder="2022" onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, end_date: value }) })} />
            </div>
            <FieldTile
              {...tile}
              label={messages.detailsLabel}
              value={(entry.details ?? []).join("\n")}
              multiline
              rows={5}
              onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, details: splitLines(value) }) })}
            />
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, education: [...education, blankEducation()] })}>{messages.addEducation}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.skillsTitle}</legend>
        {skills.map((group: SkillGroup, index) => (
          <div className="entry-card" key={index}>
            <div className="entry-head">
              <strong>{messages.skillsTitle} {index + 1}</strong>
              <button type="button" className="danger-link" onClick={() => onChange({ ...cv, skills: removeAt(skills, index) })}>{messages.remove}</button>
            </div>
            <Field label={messages.skillName} value={group.name} onChange={(value) => onChange({ ...cv, skills: updateAt(skills, index, { ...group, name: value }) })} />
            <FieldTile
              {...tile}
              label={messages.skillItems}
              value={(group.items ?? []).join("\n")}
              multiline
              rows={5}
              onChange={(value) => onChange({ ...cv, skills: updateAt(skills, index, { ...group, items: splitLines(value) }) })}
            />
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, skills: [...skills, { name: "", items: [] }] })}>{messages.addSkill}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.languagesTitle}</legend>
        {languages.map((language, index) => (
          <div className="entry-card" key={index}>
            <div className="entry-head">
              <strong>{messages.languagesTitle} {index + 1}</strong>
              <button type="button" className="danger-link" onClick={() => onChange({ ...cv, languages: removeAt(languages, index) })}>{messages.remove}</button>
            </div>
            <div className="field-grid">
              <Field label={messages.languageName} value={language.name} onChange={(value) => onChange({ ...cv, languages: updateAt(languages, index, { ...language, name: value }) })} />
              <FieldTile {...tile} label={messages.level} value={language.level ?? ""} placeholder={messages.level} onChange={(value) => onChange({ ...cv, languages: updateAt(languages, index, { ...language, level: value }) })} />
            </div>
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, languages: [...languages, { name: "", level: "" }] })}>{messages.addLanguage}</button>
      </fieldset>
    </>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  name?: string;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "url" | "numeric";
}

function Field({ label, value, onChange, required, type = "text", name, autoComplete, inputMode }: FieldProps) {
  return <label className="field"><span className="field-label">{label}</span><input type={type} value={value} required={required} name={name} autoComplete={autoComplete} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} /></label>;
}
