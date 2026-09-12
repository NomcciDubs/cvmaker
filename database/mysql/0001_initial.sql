SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET time_zone = '+00:00';

CREATE TABLE applications (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  company VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'draft',
  job_url TEXT,
  job_description LONGTEXT,
  cv_json JSON NOT NULL,
  cv_html LONGTEXT NOT NULL,
  language VARCHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  style VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  template VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT applications_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT applications_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT applications_company_nonempty CHECK (length(trim(company)) > 0),
  CONSTRAINT applications_role_nonempty CHECK (length(trim(role)) > 0),
  CONSTRAINT applications_status_nonempty CHECK (length(trim(status)) > 0),
  CONSTRAINT applications_language_valid CHECK (language IN ('en', 'es')),
  CONSTRAINT applications_style_valid CHECK (style IN ('modern', 'minimal', 'classic', 'executive', 'sidebar_compact', 'sidebar_green')),
  CONSTRAINT applications_template_valid CHECK (template IN ('cv_base', 'cv_sidebar')),
  INDEX applications_user_created_idx (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE daily_usage (
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usage_date CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT daily_usage_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT daily_usage_date_valid CHECK (usage_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE saved_cvs (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_input LONGTEXT,
  target_role VARCHAR(255),
  cv_json JSON NOT NULL,
  cv_html LONGTEXT NOT NULL,
  language VARCHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  style VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  template VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT saved_cvs_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT saved_cvs_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT saved_cvs_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT saved_cvs_source_valid CHECK (source_type IN ('manual', 'import', 'ai', 'edit', 'output')),
  CONSTRAINT saved_cvs_language_valid CHECK (language IN ('en', 'es')),
  CONSTRAINT saved_cvs_style_valid CHECK (style IN ('modern', 'minimal', 'classic', 'executive', 'sidebar_compact', 'sidebar_green')),
  CONSTRAINT saved_cvs_template_valid CHECK (template IN ('cv_base', 'cv_sidebar')),
  INDEX saved_cvs_user_updated_idx (user_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE import_workflows (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cv_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  remaining_ai_uses INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT import_workflows_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT import_workflows_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT import_workflows_hash_nonempty CHECK (length(cv_hash) > 0),
  INDEX idx_import_workflows_user (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_photos (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(255) NOT NULL,
  data_url LONGTEXT NOT NULL,
  created_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT user_photos_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT user_photos_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT user_photos_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT user_photos_data_nonempty CHECK (length(data_url) > 0),
  INDEX user_photos_user_created_idx (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cv_inputs (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT cv_inputs_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT cv_inputs_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT cv_inputs_name_nonempty CHECK (length(trim(name)) > 0),
  INDEX cv_inputs_user_updated_idx (user_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pdf_archives (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  filename VARCHAR(255) NOT NULL,
  object_key VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  content_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin,
  created_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT pdf_archives_id_nonempty CHECK (length(trim(id)) > 0),
  CONSTRAINT pdf_archives_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT pdf_archives_filename_nonempty CHECK (length(trim(filename)) > 0),
  CONSTRAINT pdf_archives_object_key_nonempty CHECK (length(trim(object_key)) > 0),
  UNIQUE INDEX pdf_archives_object_key_unique (object_key),
  INDEX idx_pdf_archives_user_created (user_id, created_at DESC),
  UNIQUE INDEX idx_pdf_archives_user_hash (user_id, content_hash)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pdf_export_usage (
  user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usage_date CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT pdf_export_usage_user_nonempty CHECK (length(trim(user_id)) > 0),
  CONSTRAINT pdf_export_usage_date_valid CHECK (usage_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pdf_quota_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  default_daily INT UNSIGNED NOT NULL,
  friend_daily INT UNSIGNED NOT NULL,
  super_admin_daily INT UNSIGNED,
  max_archived_pdfs INT UNSIGNED NOT NULL,
  max_archived_pdf_bytes BIGINT UNSIGNED NOT NULL,
  updated_at VARCHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT pdf_quota_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO pdf_quota_settings (
  id,
  default_daily,
  friend_daily,
  super_admin_daily,
  max_archived_pdfs,
  max_archived_pdf_bytes,
  updated_at
) VALUES (1, 3, 20, NULL, 20, 26214400, UTC_TIMESTAMP());
