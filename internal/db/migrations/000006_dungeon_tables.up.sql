CREATE TABLE dungeon_definitions (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    min_level INT  NOT NULL DEFAULT 1,
    floors    INT  NOT NULL DEFAULT 6
);

CREATE TABLE dungeon_runs (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dungeon_definition_id TEXT        NOT NULL REFERENCES dungeon_definitions(id),
    status                TEXT        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'completed', 'failed')),
    started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at           TIMESTAMPTZ
);

CREATE TABLE dungeon_participants (
    run_id       UUID NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    PRIMARY KEY (run_id, character_id)
);

CREATE TABLE dungeon_rewards (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       UUID    NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
    character_id UUID    NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    payload      JSONB   NOT NULL DEFAULT '{}',
    claimed      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (run_id, character_id)
);

-- Seed
INSERT INTO dungeon_definitions (id, name, min_level, floors) VALUES
    ('forsaken_crypt', 'The Forsaken Crypt', 10, 6);
