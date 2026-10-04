-- Phase 5.2 Project setup closeout slice (spec 05, 06).
--
-- What lands here:
--   1. project_settings  - per-project KEY/VALUE configuration (JSONB value), unique per
--      (project_id, setting_key). Columns already on projects (retention, advance, LDs) stay where they are.
--   2. project_calendars - project working-time calendars (timezone, weekly off days, holidays JSONB,
--      is_default). At most ONE default per project (partial unique index; the service swaps it in one
--      transaction).
--   3. Work-package links by FOREIGN KEY next to the free text:
--        itps / wirs / schedule_activities carry work_package VARCHAR(255) today. This migration adds
--        work_package_id INTEGER REFERENCES work_packages(id) and backfills it from an
--        EXACT, project-scoped match (code first, else a name that is unique in the project). The text
--        column is NOT dropped and never rewritten.
--        boq_items gains work_package_id (no free text existed, nothing to backfill).
--        project_team gains work_package_id (the participant link the plan names).
--        work_packages gains project_location_id (the location link the plan names).
--      itp_points carries no work_package column (it inherits from its ITP), so it needs nothing.
--
-- PREFLIGHT: a free-text value that matches NO work package in its project (or matches ambiguously) is
-- real data the migration must not guess about. The preflight STOPS with the counts and changes nothing.
-- Blank strings count as "no value". Report queries for a restored copy (run BEFORE applying):
--
--   SELECT 'itps' AS tbl, t.project_id, t.work_package, count(*) AS rows
--     FROM itps t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL
--      AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)) = 0
--      AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)) <> 1
--    GROUP BY 1, 2, 3
--   UNION ALL ... the same shape for wirs and schedule_activities.
--
-- Existing rows: untouched except the targeted backfill of the new work_package_id column.
-- Re-runnable: IF NOT EXISTS everywhere.

DO $$
DECLARE
  missing_tables BIGINT;
  unresolved BIGINT;
BEGIN
  SELECT count(*) INTO missing_tables FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('projects', 'work_packages', 'wbs_nodes', 'project_team', 'itps', 'wirs',
                        'schedule_activities', 'boq_items', 'project_locations');
  IF missing_tables < 9 THEN
    RAISE EXCEPTION '5.2 preflight UNSAFE: % of the 9 prerequisite tables are missing - nothing changed', 9 - missing_tables;
  END IF;

  SELECT
    (SELECT count(*) FROM itps t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL
       AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)) = 0
       AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)) <> 1)
  + (SELECT count(*) FROM wirs t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL
       AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)) = 0
       AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)) <> 1)
  + (SELECT count(*) FROM schedule_activities t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL
       AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)) = 0
       AND (SELECT count(*) FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)) <> 1)
  INTO unresolved;
  IF unresolved > 0 THEN
    RAISE EXCEPTION '5.2 preflight UNSAFE: % ITP/WIR/schedule row(s) name a work_package that matches no work_packages row (or matches ambiguously) in their project. See the report query in this file''s header; map them to real packages or clear the text, then run the migration again - nothing changed.', unresolved;
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
  weekly_off_days SMALLINT[] DEFAULT '{5,6}',   -- 0=Sunday .. 6=Saturday
  holidays JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT project_calendars_off_days_valid CHECK (weekly_off_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
CREATE INDEX IF NOT EXISTS idx_project_calendars_project ON project_calendars(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_calendars_one_default ON project_calendars(project_id) WHERE is_default;

-- 3. Work-package FKs + exact backfill --------------------------------------------
ALTER TABLE itps ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id);
ALTER TABLE wirs ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id);
ALTER TABLE schedule_activities ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id);
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id);
ALTER TABLE project_team ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id);
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS project_location_id INTEGER REFERENCES project_locations(id);
CREATE INDEX IF NOT EXISTS idx_itps_work_package ON itps(work_package_id);
CREATE INDEX IF NOT EXISTS idx_wirs_work_package ON wirs(work_package_id);
CREATE INDEX IF NOT EXISTS idx_schedule_activities_work_package ON schedule_activities(work_package_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_work_package ON boq_items(work_package_id);
CREATE INDEX IF NOT EXISTS idx_work_packages_location ON work_packages(project_location_id);

-- code wins; otherwise a name that is unique inside the project
UPDATE itps t SET work_package_id = COALESCE(
    (SELECT wp.id FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)),
    (SELECT wp.id FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)
       AND (SELECT count(*) FROM work_packages w2 WHERE w2.project_id = t.project_id AND w2.name = btrim(t.work_package)) = 1))
 WHERE t.work_package_id IS NULL AND NULLIF(btrim(t.work_package), '') IS NOT NULL;

UPDATE wirs t SET work_package_id = COALESCE(
    (SELECT wp.id FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)),
    (SELECT wp.id FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)
       AND (SELECT count(*) FROM work_packages w2 WHERE w2.project_id = t.project_id AND w2.name = btrim(t.work_package)) = 1))
 WHERE t.work_package_id IS NULL AND NULLIF(btrim(t.work_package), '') IS NOT NULL;

UPDATE schedule_activities t SET work_package_id = COALESCE(
    (SELECT wp.id FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.code = btrim(t.work_package)),
    (SELECT wp.id FROM work_packages wp WHERE wp.project_id = t.project_id AND wp.name = btrim(t.work_package)
       AND (SELECT count(*) FROM work_packages w2 WHERE w2.project_id = t.project_id AND w2.name = btrim(t.work_package)) = 1))
 WHERE t.work_package_id IS NULL AND NULLIF(btrim(t.work_package), '') IS NOT NULL;

DO $$
DECLARE
  dangling BIGINT;
BEGIN
  SELECT
    (SELECT count(*) FROM itps t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL AND t.work_package_id IS NULL)
  + (SELECT count(*) FROM wirs t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL AND t.work_package_id IS NULL)
  + (SELECT count(*) FROM schedule_activities t WHERE NULLIF(btrim(t.work_package), '') IS NOT NULL AND t.work_package_id IS NULL)
  INTO dangling;
  IF dangling > 0 THEN
    RAISE EXCEPTION '5.2 post-backfill guard: % row(s) still unresolved after the backfill - rolled back', dangling;
  END IF;
END $$;

-- Policy: the new setup surfaces use the existing 'projects' module (settings, calendars, WBS and work
-- packages live under /api/projects); no new module or wildcard grant is introduced here.
