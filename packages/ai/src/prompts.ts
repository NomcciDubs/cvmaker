import type { CvData, Language } from "@nomcci/cvmaker-domain";

const SCHEMA = `{
  "personal_info": { "full_name": "", "title": "", "email": "", "phone": "", "location": "", "photo_url": "", "links": [] },
  "summary": "",
  "experience": [],
  "education": [],
  "skills": [],
  "languages": []
}`;

function languageRule(language: Language): string {
  return language === "es"
    ? "Redacta todos los campos visibles en espanol, sin traducir nombres propios, empresas, enlaces, email o datos factuales."
    : "Write all visible fields in English without translating proper names, company names, URLs, email addresses, or factual data.";
}

function createJobContext(jobDescription: string | undefined, language: Language): string {
  if (!jobDescription) return "";
  const heading = language === "es"
    ? "Oferta de trabajo (usala solo para priorizar experiencia demostrada; no inventes requisitos ni experiencia):"
    : "Job description (use it only to prioritize demonstrated experience; do not invent requirements or experience):";
  return `\n\n${heading}\n${jobDescription}`;
}

export function importPrompt(description: string, language: Language): string {
  return language === "es"
    ? `Convierte este CV en JSON valido para renderizar una hoja A4. Sigue exactamente estos nombres de propiedades. Redacta todos los campos visibles del CV en espanol, excepto nombres propios, nombres de empresas, enlaces, email y datos factuales. Reglas obligatorias:
    - Procesa todo el texto antes de responder. Cada empresa, cargo o rango de fechas distinto de la seccion Experiencia debe ser un objeto distinto en "experience", en el mismo orden que el CV.
    - No fusiones empleos aunque tengan el mismo formato, el mismo cargo, fechas consecutivas o descripciones parecidas. Nunca anexes la descripcion de una empresa a otra.
    - Si hay tres empleos distintos en el texto, el arreglo "experience" debe contener tres objetos. Antes de devolver el JSON, verifica que cada empresa y rango de fechas detectado tenga su propia entrada.
    - Considera que empieza un empleo nuevo cuando aparezca una nueva pareja de cargo y empresa, incluso si no tiene fechas, bullets o linea en blanco. Una linea como "Desarrollador Fullstack" seguida de "PANACA" o "Agente de Soporte Tecnico" seguida de "Holy Servers LLC." siempre inicia un objeto nuevo.
    - La descripcion de un empleo termina justo antes de la siguiente pareja de cargo y empresa. Nunca guardes el nombre, cargo, fechas o descripcion de un empleo posterior dentro de "description" del empleo anterior. Si solo se conoce cargo y empresa, crea el objeto con "description": [].
    - Primero identifica mentalmente todas las parejas cargo/empresa y despues genera el arreglo completo. No omitas entradas aunque tengan poca informacion.
    - Algunos PDFs serializan primero una columna con todos los cargos y despues otra con los bloques de descripcion. Si aparecen todos los encabezados de empleo seguidos y luego el mismo numero de bloques separados por espacios, asigna esos bloques a los empleos en el mismo orden. No concentres todos los bloques en el primer empleo.
    - Cada empleo usa role, company, start_date/end_date si existen, y bullets separados en "description".
- Si el texto tiene Educacion, cada estudio debe ir en "education".
- Si el texto tiene Habilidades, crea grupos en "skills"; si no hay grupos claros usa {"name":"Skills","items":[...]}.
- Si el texto tiene Idiomas, cada idioma debe ir en "languages".
- Usa arreglos vacios [] para secciones sin datos; no crees objetos vacios.
- No inventes email, telefono, fechas, empresas, estudios, enlaces ni habilidades.
- "description", "details" e "items" siempre son arrays de strings.
Devuelve solo JSON.

Esquema:
${SCHEMA}

CV limpio:
${description}`
    : `Convert this resume into valid JSON for rendering an A4 resume. Use exactly these property names. Write every user-visible resume field in English, except proper names, company names, URLs, email addresses, and factual data. Mandatory rules:
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

export function repairPrompt(description: string, cv: CvData, language: Language): string {
  return language === "es"
    ? `Corrige solamente la asignacion de las descripciones de experiencia en este CV JSON. El borrador concentro casi todos los bullets en un empleo y dejo otros vacios, algo que puede ocurrir porque el PDF almacena una columna de cargos antes de la columna de descripciones.

Reglas:
- Conserva todas las entradas de experience, sus cargos, empresas, fechas y orden.
- Reasigna cada bullet al empleo al que semanticamente corresponde segun tecnologias, responsabilidades y contexto del texto fuente.
- No dejes un bullet en el primer empleo solo por aparecer despues de todos los encabezados en el orden interno del PDF.
- No inventes ni elimines informacion. Si no existe evidencia para un empleo, deja description como [].
- Conserva sin cambios las demas secciones y devuelve solo JSON.

Texto extraido del PDF:
${description}

JSON a corregir:
${JSON.stringify(cv)}`
    : `Correct only the experience-description assignments in this resume JSON. The draft concentrated nearly every bullet under one job and left later jobs empty, which can happen when a PDF stores the job-title column before the description column.

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

export function rewritePrompt(cv: CvData, targetRole: string, jobDescription: string | undefined, language: Language): string {
  const jobContext = createJobContext(jobDescription, language);
  return language === "es"
    ? `Mejora este CV manteniendo exactamente el esquema. ${languageRule(language)} Redaccion profesional, bullets claros y medibles cuando sea posible, resumen breve orientado al rol. No cambies datos factuales. Devuelve solo JSON.\n\nRol objetivo:\n${targetRole}${jobContext}\n\nJSON actual:\n${JSON.stringify(cv)}`
    : `Improve this CV while keeping exactly the schema. ${languageRule(language)} Use professional wording, clear measurable bullets where possible, and a concise role-oriented summary. Do not change factual data. Return JSON only.\n\nTarget role:\n${targetRole}${jobContext}\n\nCurrent JSON:\n${JSON.stringify(cv)}`;
}

export function modifyPrompt(cv: CvData, instruction: string, jobDescription: string | undefined, language: Language): string {
  const jobContext = createJobContext(jobDescription, language);
  return language === "es"
    ? `Modifica este CV siguiendo la instruccion del usuario y manteniendo exactamente el esquema. ${languageRule(language)} Puedes mejorar redaccion, agregar habilidades si el usuario las entrega, reorganizar secciones o adaptar al rol. No inventes datos factuales. Devuelve solo JSON.\n\nInstruccion:\n${instruction}${jobContext}\n\nJSON actual:\n${JSON.stringify(cv)}`
    : `Modify this CV following the user's instruction while keeping exactly the schema. ${languageRule(language)} You may improve wording, add skills if supplied, reorganize sections, or tailor it to a role. Do not invent factual data. Return JSON only.\n\nInstruction:\n${instruction}${jobContext}\n\nCurrent JSON:\n${JSON.stringify(cv)}`;
}

export function translatePrompt(cv: CvData, language: Language): string {
  const target = language === "es" ? "Spanish" : "English";
  return `Translate every user-visible text value in this CV JSON into ${target} while keeping exactly the same schema, arrays, order, and factual meaning. Do not translate proper names, company names, locations, email addresses, phone numbers, URLs, dates, or technical terms that should remain unchanged. Translate titles, summary, experience bullets, education details, section group names, language levels, and skill descriptions where appropriate. Return JSON only.\n\nJSON:\n${JSON.stringify(cv)}`;
}
