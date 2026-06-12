-- Clear old items that don't match v6 design
DELETE FROM equipment;
DELETE FROM inventory_items;
DELETE FROM item_templates;

-- Common / expedition items
INSERT INTO item_templates (name, slot, rarity, source, attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus) VALUES
  ('Iron Sword',        'Weapon', 'Common',   'expedition',  4,  0,  0, 0,  0),
  ('Leather Chestplate','Armor',  'Common',   'expedition',  0,  1, 14, 0,  0),
  ('Leather Boots',     'Boots',  'Common',   'expedition',  0,  0,  8, 0,  0),
  ('Copper Ring',       'Ring',   'Common',   'expedition',  2,  0,  0, 0,  0),

-- Uncommon / expedition items
  ('Soldier''s Sword',  'Weapon', 'Uncommon', 'expedition',  8,  0,  0, 2,  0),
  ('Scout''s Helm',     'Helmet', 'Uncommon', 'expedition',  0,  2, 18, 0,  0),
  ('Quartz Amulet',     'Amulet', 'Uncommon', 'expedition',  0,  0,  0, 0,  5),

-- Rare / dungeon items
  ('Crypt Blade',       'Weapon', 'Rare',     'dungeon',    14,  0,  0, 5,  0),
  ('Watcher''s Helm',   'Helmet', 'Rare',     'dungeon',     0,  4, 30, 0,  0),
  ('Sepulchral Ring',   'Ring',   'Rare',     'dungeon',     6,  0,  0, 0,  5),
  ('Silent Boots',      'Boots',  'Rare',     'dungeon',     0,  0, 20, 4,  0),

-- Epic / dungeon items
  ('Crypt Lord''s Mantle','Armor','Epic',     'dungeon',     0,  8, 60, 0,  0),
  ('Profane Axe',       'Weapon', 'Epic',     'dungeon',    24,  0,  0, 8,  0),
  ('Crown of Bones',    'Helmet', 'Epic',     'dungeon',     0,  0, 40, 0, 10);
