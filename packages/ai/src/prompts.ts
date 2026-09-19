import { cvLanguageInfo, type CvData, type CvLanguage } from "@nomcci/cvmaker-domain";

const SCHEMA = `{
  "personal_info": { "full_name": "", "title": "", "email": "", "phone": "", "location": "", "photo_url": "", "links": [] },
  "summary": "",
  "experience": [],
  "education": [],
  "skills": [],
  "languages": []
}`;

function outputLanguage(language: CvLanguage): string {
  return cvLanguageInfo(language).nameEn;
}

function languageRule(language: CvLanguage): string {
  return `Write all visible fields in ${outputLanguage(language)} without translating proper names, company names, URLs, email addresses, or factual data.`;
}

function jobContext(jobDescription: string | undefined): string {
  if (!jobDescription) return "";
  return `\n\nJob description (use it only to prioritize demonstrated experience; do not invent requirements or experience):\n${jobDescription}`;
}

export function importPrompt(description: string, language: CvLanguage): string {
  return `Convert this resume into valid JSON for rendering an A4 resume. Use exactly these property names. Write every user-visible resume field in ${outputLanguage(language)}, except proper names, company names, URLs, email addresses, and factual data. Mandatory rules:
    - Process the complete text before responding. Every distinct employer, role, or date range in the Experience section must become its own object in "experience", in the original resume order.
    - Never merge jobs because they share formatting, a title, consecutive dates, or similar descriptions. Never append one employer's description to another employer.
    - If the source has three distinct jobs, the "experience" array must contain three objects. Before returning JSON, verify every detected employer and date range has its own entry.
    - A new job starts when a new role and employer pair appears, even without dates, bullets, or a blank line. For example, "Fullstack Developer" followed by "PANACA" or "Technical Support Agent" followed by "Holy Servers LLC." always starts a new object.
    - A job description ends immediately before the next role and employer pair. Never place a later job's role, employer, dates, or description inside the previous job's "description". If only role and employer are known, create the object with "description": [].
    - First identify every role/employer pair, then materialize the complete array. Do not omit entries with sparse information.
    - Some PDFs serialize a column containing every job heading before a second column containing the description blocks. If all job headings occur first and are followed by the same number of visually separated description blocks, assign those blocks to the jobs in order. Do not concentrate every block under the first job.
    - Every job uses role, company, start_date/end_date when available, and separate bullet points in "description".
- If the text contains Education, every degree/school must go into "education".
- If the text contains Skills, create groups in "skills"; if no clear groups exist use {"name":"Skills","items":[...]}.
- If the text contains Languages, every language must go into "languages".
- Use empty arrays [] for sections with no data; do not create empty objects.
- Do not invent email, phone, dates, companies, education, links, or skills.
- "description", "details", and "items" must always be arrays of strings.
Return JSON only.

Schema:
${SCHEMA}

Clean resume:
${description}`;
}

export function repairPrompt(description: string, cv: CvData, language: CvLanguage): string {
  return `Correct only the experience-description assignments in this resume JSON, writing every visible field in ${outputLanguage(language)}. The draft concentrated nearly every bullet under one job and left later jobs empty, which can happen when a PDF stores the job-title column before the description column.

Rules:
- Preserve every experience entry, its role, company, dates, and order.
- Reassign each bullet to the semantically matching job using technologies, responsibilities, and context from the source text.
- Do not keep a bullet under the first job merely because it occurs after all job headings in the PDF's internal order.
- Do not invent or delete information. If there is no evidence for a job, leave description as [].
- Keep every other section unchanged and return JSON only.

Extracted PDF text:
${description}

JSON to correct:
${JSON.stringify(cv)}`;
}

export function rewritePrompt(cv: CvData, targetRole: string, jobDescription: string | undefined, language: CvLanguage): string {
  const context = jobContext(jobDescription);
  return `Improve this CV while keeping exactly the schema. ${languageRule(language)} Use professional wording, clear measurable bullets where possible, and a concise role-oriented summary. Do not change factual data. Return JSON only.\n\nTarget role:\n${targetRole}${context}\n\nCurrent JSON:\n${JSON.stringify(cv)}`;
}

export function modifyPrompt(cv: CvData, instruction: string, jobDescription: string | undefined, language: CvLanguage): string {
  const context = jobContext(jobDescription);
  return `Modify this CV following the user's instruction while keeping exactly the schema. ${languageRule(language)} You may improve wording, add skills if supplied, reorganize sections, or tailor it to a role. Do not invent factual data. Return JSON only.\n\nInstruction:\n${instruction}${context}\n\nCurrent JSON:\n${JSON.stringify(cv)}`;
}

export function translatePrompt(cv: CvData, language: CvLanguage): string {
  const target = outputLanguage(language);
  return `Translate every user-visible text value in this CV JSON into ${target} while keeping exactly the same schema, arrays, order, and factual meaning. Do not translate proper names, company names, locations, email addresses, phone numbers, URLs, dates, or technical terms that should remain unchanged. Translate titles, summary, experience bullets, education details, section group names, language levels, and skill descriptions where appropriate. Return JSON only.\n\nJSON:\n${JSON.stringify(cv)}`;
}
