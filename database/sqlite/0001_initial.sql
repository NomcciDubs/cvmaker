PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE applications (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  company TEXT NOT NULL CHECK (length(trim(company)) > 0),
  role TEXT NOT NULL CHECK (length(trim(role)) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (length(trim(status)) > 0),
  job_url TEXT,
  job_description TEXT,
  cv_json TEXT NOT NULL CHECK (json_valid(cv_json)),
  cv_html TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'es')),
  style TEXT NOT NULL CHECK (style IN ('modern', 'minimal', 'classic', 'executive', 'sidebar_compact', 'sidebar_green')),
  template TEXT NOT NULL CHECK (template IN ('cv_base', 'cv_sidebar')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX applications_user_created_idx ON applications(user_id, created_at DESC);

CREATE TABLE daily_usage (
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  usage_date TEXT NOT NULL CHECK (usage_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(count) = 'integer' AND count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE saved_cvs (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'import', 'ai', 'edit', 'output')),
  source_input TEXT,
  target_role TEXT,
  cv_json TEXT NOT NULL CHECK (json_valid(cv_json)),
  cv_html TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'es')),
  style TEXT NOT NULL CHECK (style IN ('modern', 'minimal', 'classic', 'executive', 'sidebar_compact', 'sidebar_green')),
  template TEXT NOT NULL CHECK (template IN ('cv_base', 'cv_sidebar')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX saved_cvs_user_updated_idx ON saved_cvs(user_id, updated_at DESC);

CREATE TABLE import_workflows (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  cv_hash TEXT NOT NULL CHECK (length(cv_hash) > 0),
  remaining_ai_uses INTEGER NOT NULL DEFAULT 1 CHECK (typeof(remaining_ai_uses) = 'integer' AND remaining_ai_uses >= 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_import_workflows_user ON import_workflows(user_id, expires_at);

CREATE TABLE user_photos (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  data_url TEXT NOT NULL CHECK (length(data_url) > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX user_photos_user_created_idx ON user_photos(user_id, created_at DESC);

CREATE TABLE cv_inputs (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX cv_inputs_user_updated_idx ON cv_inputs(user_id, updated_at DESC);

CREATE TABLE pdf_archives (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  filename TEXT NOT NULL CHECK (length(trim(filename)) > 0),
  object_key TEXT NOT NULL UNIQUE CHECK (length(trim(object_key)) > 0),
  size_bytes INTEGER NOT NULL CHECK (typeof(size_bytes) = 'integer' AND size_bytes >= 0),
  content_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_pdf_archives_user_created ON pdf_archives(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_pdf_archives_user_hash
  ON pdf_archives(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE pdf_export_usage (
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  usage_date TEXT NOT NULL CHECK (usage_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(count) = 'integer' AND count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE pdf_quota_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_daily INTEGER NOT NULL CHECK (typeof(default_daily) = 'integer' AND default_daily >= 0),
  friend_daily INTEGER NOT NULL CHECK (typeof(friend_daily) = 'integer' AND friend_daily >= 0),
  super_admin_daily INTEGER CHECK (super_admin_daily IS NULL OR (typeof(super_admin_daily) = 'integer' AND super_admin_daily >= 0)),
  max_archived_pdfs INTEGER NOT NULL CHECK (typeof(max_archived_pdfs) = 'integer' AND max_archived_pdfs >= 0),
  max_archived_pdf_bytes INTEGER NOT NULL CHECK (typeof(max_archived_pdf_bytes) = 'integer' AND max_archived_pdf_bytes >= 0),
  updated_at TEXT NOT NULL
);

INSERT INTO pdf_quota_settings (
  id,
  default_daily,
  friend_daily,
  super_admin_daily,
  max_archived_pdfs,
  max_archived_pdf_bytes,
  updated_at
) VALUES (1, 3, 20, NULL, 20, 26214400, CURRENT_TIMESTAMP);

COMMIT;
