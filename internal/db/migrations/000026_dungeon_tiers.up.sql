ALTER TABLE dungeon_definitions
    ADD COLUMN IF NOT EXISTS enemy_hp_mult  FLOAT   NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS enemy_atk_mult FLOAT   NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS gold_mult      FLOAT   NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS loot_rarities  TEXT[]  NOT NULL DEFAULT ARRAY['Rare'];

-- Seed the three canonical tiers (upsert so re-running is safe)
INSERT INTO dungeon_definitions (id, name, min_level, floors, enemy_hp_mult, enemy_atk_mult, gold_mult, loot_rarities) VALUES
    ('normal', 'The Crypt',          1,  6, 1.0, 1.0, 1.0, ARRAY['Rare']),
    ('hard',   'The Forsaken Crypt', 15, 6, 2.0, 1.5, 1.5, ARRAY['Epic']),
    ('elite',  'The Abyssal Crypt',  25, 6, 4.0, 2.5, 2.5, ARRAY['Epic', 'Legendary'])
ON CONFLICT (id) DO UPDATE SET
    name            = EXCLUDED.name,
    min_level       = EXCLUDED.min_level,
    enemy_hp_mult   = EXCLUDED.enemy_hp_mult,
    enemy_atk_mult  = EXCLUDED.enemy_atk_mult,
    gold_mult       = EXCLUDED.gold_mult,
    loot_rarities   = EXCLUDED.loot_rarities;
