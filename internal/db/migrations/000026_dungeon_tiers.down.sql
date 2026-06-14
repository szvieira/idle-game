ALTER TABLE dungeon_definitions
    DROP COLUMN IF EXISTS enemy_hp_mult,
    DROP COLUMN IF EXISTS enemy_atk_mult,
    DROP COLUMN IF EXISTS gold_mult,
    DROP COLUMN IF EXISTS loot_rarities;

DELETE FROM dungeon_definitions WHERE id IN ('normal', 'hard', 'elite');
