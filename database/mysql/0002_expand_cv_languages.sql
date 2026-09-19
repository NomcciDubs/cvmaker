-- 0002: expand CV document languages from ('en', 'es') to the 12-code catalog.
-- Replaces the language CHECK constraints incrementally. Apply after
-- 0001_initial.sql and never edit 0001. Language codes stay within VARCHAR(5).

ALTER TABLE applications DROP CONSTRAINT applications_language_valid;
ALTER TABLE applications ADD CONSTRAINT applications_language_valid
  CHECK (language IN ('en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'id', 'vi', 'ro'));

ALTER TABLE saved_cvs DROP CONSTRAINT saved_cvs_language_valid;
ALTER TABLE saved_cvs ADD CONSTRAINT saved_cvs_language_valid
  CHECK (language IN ('en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'id', 'vi', 'ro'));
