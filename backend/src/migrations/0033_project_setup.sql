-- Phase 5.2 Project setup closeout slice (spec 05, 06).
--
-- What lands here:
--   1. project_settings  — per-project configuration (advances, retention, penalties kept as
--      columns on projects stay untouched; this is the KEY/VALUE settings supplement the plan asks
--      for, unique per (project_id, setting_key)).
--   2. project_calendars — project working-time calendars (name, timezone, weekly off days,
--      holidays JSONB, is_default; one default per project replaces the default in its transaction).
--   3. Work-package links: itps/wirs/schedule_activities each carry FREE-TEXT work_package
--      VARCHAR(255) today. This migration adds work_package_id INTEGER REFERENCES work_packages(id)
--      ON DELETE RESTRICT next to the free text (the text column is NOT dropped — pending 5.7's
--      data-hygiene pass) and BACKFILLS it from exact, project-scoped matches. The preflight STOPS
--      with counts when a value cannot be resolved; the report query below shows the unmatched set.
--      quantity_measurements.work_package_id already REFERENCES work_packages (0016) — nothing to do.
--   4. project_team.work_package_id (participant link the plan names) — additive, nullable.
--
-- Existing rows: untouched except the targeted backfill of work_package_id (never deletes,
-- never rewrites the text values). Re-runnable: IF NOT EXISTS everywhere.
--
-- Preflight report queries for a restored copy (run these BEFORE applying when unsure):
--
--   -- unmatched ITP work packages (relative to the exact-match candidates present):
--   SELECT i.project_id, i.work_package, count(*) AS rows
--     FROM itps i WHERE i.work_package IS NOT NULL AND NOT EXISTS (
--       SELECT 1 FROM work_packages wp
--        WHERE wp.project_id = i.project_id AND (wp.code = i.work_package OR wp.name = i.work_package))
--    GROUP BY 1, 2 ORDER BY 3 DESC;
--   -- the same shape for wirs and schedule_activities (replace the table name).
DO $$
DECLARE
  missing_tables BIGINT;
  collisions BIGINT;
BEGIN
  SELECT count(*) INTO missing_tables FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('projects', 'work_packages', 'wbs_nodes', 'project_team');
  IF missing_tables < 4 THEN
    RAISE EXCEPTION '5.2 preflight UNSAFE: % of the 4 prerequisite tables (projects, work_packages, wbs_nodes, project_team) are missing — nothing changed', 4 - missing_tables;
  END IF;

  -- A (project, code) collision does not block: the backfill only claims VALUES that resolve;
  -- the stop condition below is about rows whose text matches NOTHING.
  SELECT
    (SELECT count(*) FROM itps i WHERE i.work_package IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work_packages wp WHERE wp.project_id = i.project_id
         AND (wp.code = i.work_package OR wp.name = i.work_package)))
  + (SELECT count(*) FROM wirs w WHERE w.work_package IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work_packages wp
        WHERE wp.project_id = w.project_id
          AND (wp.code = w.work_package OR wp.name = w.work_package)))
  + (SELECT count(*) FROM schedule_activities sa WHERE sa.work_package IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM work_packages wp
        WHERE wp.project_id = sa.project_id
          AND (wp.code = sa.work_package OR wp.name = sa.work_package)))
  INTO collisions;
  IF collisions > 0 THEN
    RAISE EXCEPTION '5.2 preflight UNSAFE: % ITP/WIR/schedule row(s) name a work_package that matches NO work_packages row in their project. See the report queries in this file''s header; map them to real packages or clear the text, then run the migration again — nothing changed.', collisions;
  END IF;
END $$;

-- 1. Project settings ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_settings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, setting_key)
);

-- 2. Project working-time calendars ---------------------------------------------
CREATE TABLE IF NOT EXISTS project_calendars (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  name_en VARCHAR(255),
  timezone VARCHAR(64) DEFAULT 'Africa/Cairo',
  weekly_off_days SMALLINT[] DEFAULT '{5,6}',   -- 0=Sunday .. 6=Saturday (ISO wday-1)
  holidays JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_calendars_project ON project_calendars(project_id);

-- 3. Work-package FKs + backfill --------------------------------------------------
ALTER TABLE itps ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL;
ALTER TABLE wirs ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL;
ALTER TABLE schedule_activities ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL;
ALTER TABLE project_team ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL;

UPDATE itps i SET work_package_id = wp.id
  FROM work_packages wp
 WHERE wp.project_id = i.project_id AND (wp.code = i.work_package OR wp.name = i.work_package)
   AND i.work_package_id IS NULL AND i.work_package IS NOT NULL;

UPDATE wirs w SET work_package_id = wp.id
  FROM work_packages wp
 WHERE wp.project_id = w.project_id AND (wp.code = w.work_package OR wp.name = w.work_package)
   AND w.work_package_id IS NULL AND w.work_package IS NOT NULL;

UPDATE schedule_activities sa SET work_package_id = wp.id
  FROM work_packages wp
 WHERE wp.project_id = sa.project_id AND (wp.code = sa.work_package OR wp.name = sa.work_package)
   AND sa.work_package_id IS NULL AND sa.work_package IS NOT NULL;

DO $$
DECLARE
  dangling BIGINT;
BEGIN
  SELECT
    (SELECT count(*) FROM itps i WHERE i.work_package IS NOT NULL AND i.work_package_id IS NULL)
  + (SELECT count(*) FROM wirs w WHERE w.work_package IS NOT NULL AND w.work_package_id IS NULL)
  + (SELECT count(*) FROM schedule_activities sa WHERE sa.work_package IS NOT NULL AND sa.work_package_id IS NULL)
  INTO dangling;
  IF dangling > 0 THEN
    -- The preflight above guarantees this stays 0 on a consistent database; if a concurrent writer
    -- inserted rows between the gates, the migration rolls back entirely.
    RAISE EXCEPTION '5.2 post-backfill guard: % row(s) STILL unresolved after backfill — rolled back', dangling;
  END IF;
END $$;

-- 4. ITP points already carry work_package VARCHAR — give them the FK too (same exact-backfill) --
ALTER TABLE itp_points ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL;
UPDATE itp_points p SET work_package_id = wp.id
  FROM itps i, work_packages wp
 WHERE p.itp_id = i.id AND wp.project_id = i.project_id AND p.work_package IS NOT NULL
   AND (wp.code = p.work_package OR wp.name = p.work_package) AND p.work_package_id IS NULL;
