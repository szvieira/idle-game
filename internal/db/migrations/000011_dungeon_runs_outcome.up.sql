ALTER TABLE dungeon_runs
    ADD COLUMN rooms_cleared INT  NOT NULL DEFAULT 0,
    ADD COLUMN outcome       TEXT CHECK (outcome IN ('victory', 'defeat'));
