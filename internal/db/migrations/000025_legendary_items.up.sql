-- Legendary raid items
INSERT INTO item_templates (name, slot, rarity, source, attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus, class_restriction) VALUES
  -- Generic (any class)
  ('Eternal Band',      'Ring',   'Legendary', 'raid',  8,  0,  0,  0, 10, NULL),
  ('Titan''s Girdle',   'Armor',  'Legendary', 'raid',  0,  6, 90,  0,  0, NULL),
  ('Voidwalker Boots',  'Boots',  'Legendary', 'raid',  0,  0, 35,  8,  0, NULL),
  ('Soulchain Amulet',  'Amulet', 'Legendary', 'raid',  5,  0,  0,  0, 15, NULL),

  -- Warrior exclusives
  ('Worldbreaker',      'Weapon', 'Legendary', 'raid', 40,  0,  0,  6,  0, 'Warrior'),
  ('Warborn Helm',      'Helmet', 'Legendary', 'raid',  0,  8, 50,  0,  0, 'Warrior'),

  -- Mage exclusives
  ('Void Scepter',      'Weapon', 'Legendary', 'raid', 38,  0,  0,  0, 12, 'Mage'),
  ('Astral Crown',      'Helmet', 'Legendary', 'raid', 10,  0,  0,  0, 15, 'Mage'),

  -- Paladin exclusives
  ('Holy Avenger',      'Weapon', 'Legendary', 'raid', 30,  0, 40,  0,  0, 'Paladin'),
  ('Divine Aegis',      'Armor',  'Legendary', 'raid',  0, 12, 80,  0,  0, 'Paladin');
