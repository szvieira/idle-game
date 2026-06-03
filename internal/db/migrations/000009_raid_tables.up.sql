CREATE TABLE raid_definitions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    min_level   INT  NOT NULL DEFAULT 15,
    max_players INT  NOT NULL DEFAULT 3
);

CREATE TABLE raid_lobbies (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_definition_id  TEXT        NOT NULL REFERENCES raid_definitions(id),
    leader_character_id UUID        NOT NULL REFERENCES characters(id),
    invite_code         TEXT        UNIQUE NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting', 'ready', 'started', 'cancelled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE raid_lobby_members (
    lobby_id     UUID        NOT NULL REFERENCES raid_lobbies(id) ON DELETE CASCADE,
    character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    class        TEXT        NOT NULL,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lobby_id, character_id)
);

CREATE TABLE raid_runs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id    UUID        NOT NULL REFERENCES raid_lobbies(id),
    status      TEXT        NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed')),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Seed
INSERT INTO raid_definitions (id, name, min_level, max_players) VALUES
    ('forsaken_warlord', 'The Forsaken Warlord', 15, 3);
