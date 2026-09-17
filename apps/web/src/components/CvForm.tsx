import type { CvData, Education, Experience, SkillGroup } from "@nomcci/cvmaker-domain";
import type { Messages } from "../i18n/messages";

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

  function updatePersonal(field: keyof CvData["personal_info"], value: string) {
    onChange({ ...cv, personal_info: { ...cv.personal_info, [field]: value } });
  }

  return (
    <>
      <div className="field-grid">
        <Field label={messages.fullName} value={cv.personal_info.full_name} required onChange={(value) => updatePersonal("full_name", value)} />
        <Field label={messages.professionalTitle} value={cv.personal_info.title ?? ""} onChange={(value) => updatePersonal("title", value)} />
        <Field label={messages.email} value={cv.personal_info.email ?? ""} type="email" onChange={(value) => updatePersonal("email", value)} />
        <Field label={messages.phone} value={cv.personal_info.phone ?? ""} onChange={(value) => updatePersonal("phone", value)} />
        <Field label={messages.location} value={cv.personal_info.location ?? ""} onChange={(value) => updatePersonal("location", value)} />
      </div>

      <fieldset className="cv-subsection">
        <legend>{messages.links}</legend>
        {links.map((link, index) => (
          <div className="field-grid" key={index}>
            <Field label={messages.linkLabel} value={link.label} onChange={(value) => onChange({
              ...cv,
              personal_info: { ...cv.personal_info, links: updateAt(links, index, { ...link, label: value }) },
            })} />
            <div className="inline-actions">
              <Field label={messages.linkUrl} value={link.url} type="url" onChange={(value) => onChange({
                ...cv,
                personal_info: { ...cv.personal_info, links: updateAt(links, index, { ...link, url: value }) },
              })} />
              <button type="button" className="danger-link" onClick={() => onChange({
                ...cv,
                personal_info: { ...cv.personal_info, links: removeAt(links, index) },
              })}>{messages.remove}</button>
            </div>
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({
          ...cv,
          personal_info: { ...cv.personal_info, links: [...links, { label: "", url: "" }] },
        })}>{messages.addLink}</button>
      </fieldset>

      <label>{messages.summary}<textarea value={cv.summary ?? ""} rows={4} onChange={(event) => onChange({ ...cv, summary: event.target.value })} /></label>

      <fieldset className="cv-subsection">
        <legend>{messages.experienceTitle}</legend>
        {experience.map((entry, index) => (
          <div className="entry-card" key={index}>
            <div className="field-grid">
              <Field label={messages.role} value={entry.role} onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, role: value }) })} />
              <Field label={messages.company} value={entry.company} onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, company: value }) })} />
            </div>
            <div className="field-grid">
              <Field label={messages.location} value={entry.location ?? ""} onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, location: value }) })} />
              <Field label={messages.startDate} value={entry.start_date ?? ""} onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, start_date: value }) })} />
              <Field label={messages.endDate} value={entry.end_date ?? ""} onChange={(value) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, end_date: value }) })} />
            </div>
            <label>{messages.roleDescription}<textarea value={(entry.description ?? []).join("\n")} rows={4} onChange={(event) => onChange({ ...cv, experience: updateAt(experience, index, { ...entry, description: splitLines(event.target.value) }) })} /></label>
            <button type="button" className="danger-link" onClick={() => onChange({ ...cv, experience: removeAt(experience, index) })}>{messages.remove}</button>
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, experience: [...experience, blankExperience()] })}>{messages.addExperience}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.educationTitle}</legend>
        {education.map((entry, index) => (
          <div className="entry-card" key={index}>
            <div className="field-grid">
              <Field label={messages.degree} value={entry.degree} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, degree: value }) })} />
              <Field label={messages.institution} value={entry.institution} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, institution: value }) })} />
            </div>
            <div className="field-grid">
              <Field label={messages.location} value={entry.location ?? ""} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, location: value }) })} />
              <Field label={messages.startDate} value={entry.start_date ?? ""} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, start_date: value }) })} />
              <Field label={messages.endDate} value={entry.end_date ?? ""} onChange={(value) => onChange({ ...cv, education: updateAt(education, index, { ...entry, end_date: value }) })} />
            </div>
            <label>{messages.detailsLabel}<textarea value={(entry.details ?? []).join("\n")} rows={3} onChange={(event) => onChange({ ...cv, education: updateAt(education, index, { ...entry, details: splitLines(event.target.value) }) })} /></label>
            <button type="button" className="danger-link" onClick={() => onChange({ ...cv, education: removeAt(education, index) })}>{messages.remove}</button>
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, education: [...education, blankEducation()] })}>{messages.addEducation}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.skillsTitle}</legend>
        {skills.map((group: SkillGroup, index) => (
          <div className="entry-card" key={index}>
            <Field label={messages.skillName} value={group.name} onChange={(value) => onChange({ ...cv, skills: updateAt(skills, index, { ...group, name: value }) })} />
            <label>{messages.skillItems}<textarea value={(group.items ?? []).join("\n")} rows={3} onChange={(event) => onChange({ ...cv, skills: updateAt(skills, index, { ...group, items: splitLines(event.target.value) }) })} /></label>
            <button type="button" className="danger-link" onClick={() => onChange({ ...cv, skills: removeAt(skills, index) })}>{messages.remove}</button>
          </div>
        ))}
        <button type="button" className="add-button" onClick={() => onChange({ ...cv, skills: [...skills, { name: "", items: [] }] })}>{messages.addSkill}</button>
      </fieldset>

      <fieldset className="cv-subsection">
        <legend>{messages.languagesTitle}</legend>
        {languages.map((language, index) => (
          <div className="field-grid" key={index}>
            <Field label={messages.languageName} value={language.name} onChange={(value) => onChange({ ...cv, languages: updateAt(languages, index, { ...language, name: value }) })} />
            <div className="inline-actions">
              <Field label={messages.level} value={language.level ?? ""} onChange={(value) => onChange({ ...cv, languages: updateAt(languages, index, { ...language, level: value }) })} />
              <button type="button" className="danger-link" onClick={() => onChange({ ...cv, languages: removeAt(languages, index) })}>{messages.remove}</button>
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
}

function Field({ label, value, onChange, required, type = "text" }: FieldProps) {
  return <label>{label}<input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}
