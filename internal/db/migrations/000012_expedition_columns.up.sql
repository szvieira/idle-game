ALTER TABLE expedition_runs
  RENAME COLUMN expedition_definition_id TO zone_id;

ALTER TABLE expedition_runs
  RENAME COLUMN last_collected_at TO last_activity_at;

ALTER TABLE expedition_runs
  ADD COLUMN accumulated_seconds BIGINT NOT NULL DEFAULT 0;
