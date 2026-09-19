-- 0002: expand CV document languages from ('en', 'es') to the 12-code catalog.
-- SQLite cannot drop a CHECK constraint, so the affected tables are rebuilt
-- preserving every row and index. Apply after 0001_initial.sql and never edit 0001.

PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

CREATE TABLE applications_new (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  company TEXT NOT NULL CHECK (length(trim(company)) > 0),
  role TEXT NOT NULL CHECK (length(trim(role)) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (length(trim(status)) > 0),
  job_url TEXT,
  job_description TEXT,
  cv_json TEXT NOT NULL CHECK (json_valid(cv_json)),
  cv_html TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'id', 'vi', 'ro')),
  style TEXT NOT NULL CHECK (style IN ('modern', 'minimal', 'classic', 'executive', 'sidebar_compact', 'sidebar_green')),
  template TEXT NOT NULL CHECK (template IN ('cv_base', 'cv_sidebar')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO applications_new (
  id, user_id, company, role, status, job_url, job_description,
  cv_json, cv_html, language, style, template, created_at, updated_at
) SELECT
  id, user_id, company, role, status, job_url, job_description,
  cv_json, cv_html, language, style, template, created_at, updated_at
FROM applications;

DROP TABLE applications;

ALTER TABLE applications_new RENAME TO applications;

CREATE INDEX applications_user_created_idx ON applications(user_id, created_at DESC);

CREATE TABLE saved_cvs_new (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'import', 'ai', 'edit', 'output')),
  source_input TEXT,
  target_role TEXT,
  cv_json TEXT NOT NULL CHECK (json_valid(cv_json)),
  cv_html TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'id', 'vi', 'ro')),
  style TEXT NOT NULL CHECK (style IN ('modern', 'minimal', 'classic', 'executive', 'sidebar_compact', 'sidebar_green')),
  template TEXT NOT NULL CHECK (template IN ('cv_base', 'cv_sidebar')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO saved_cvs_new (
  id, user_id, name, source_type, source_input, target_role,
  cv_json, cv_html, language, style, template, created_at, updated_at
) SELECT
  id, user_id, name, source_type, source_input, target_role,
  cv_json, cv_html, language, style, template, created_at, updated_at
FROM saved_cvs;

DROP TABLE saved_cvs;

ALTER TABLE saved_cvs_new RENAME TO saved_cvs;

CREATE INDEX saved_cvs_user_updated_idx ON saved_cvs(user_id, updated_at DESC);

COMMIT;

PRAGMA foreign_keys = ON;
