INSERT INTO dungeon_definitions (id, name, min_level, floors) VALUES
    ('spider_lair',   'Arachnid Lair',    1,  4),
    ('dark_sanctum',  'Dark Sanctum',     20, 8),
    ('void_citadel',  'Void Citadel',     35, 10)
ON CONFLICT (id) DO NOTHING;
