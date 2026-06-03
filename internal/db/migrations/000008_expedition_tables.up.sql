CREATE TABLE expedition_definitions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    zone_number INT  NOT NULL,
    min_level   INT  NOT NULL DEFAULT 1
);

CREATE TABLE expedition_runs (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id             UUID        UNIQUE NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    expedition_definition_id TEXT        NOT NULL REFERENCES expedition_definitions(id),
    started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_collected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                   TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused'))
);

-- Seed
INSERT INTO expedition_definitions (id, name, zone_number, min_level) VALUES
    ('forest',        'Forest',        1,  1),
    ('ruins',         'Ruins',         2, 10),
    ('shadow_cavern', 'Shadow Cavern', 3, 18);
