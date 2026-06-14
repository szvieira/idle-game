ALTER TABLE skill_nodes
  ADD COLUMN col              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN row              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN class_restriction TEXT DEFAULT NULL;

-- Tag existing Warrior nodes with positions + restriction
UPDATE skill_nodes SET col =  0, row = 0, class_restriction = 'Warrior' WHERE id = 'whirlwind';
UPDATE skill_nodes SET col = -1, row = 1, class_restriction = 'Warrior' WHERE id = 'brute_force';
UPDATE skill_nodes SET col = -1, row = 2, class_restriction = 'Warrior' WHERE id = 'fury';
UPDATE skill_nodes SET col = -1, row = 3, class_restriction = 'Warrior' WHERE id = 'charge';
UPDATE skill_nodes SET col =  1, row = 1, class_restriction = 'Warrior' WHERE id = 'iron_skin';
UPDATE skill_nodes SET col =  1, row = 2, class_restriction = 'Warrior' WHERE id = 'vigor';

-- Mage tree
INSERT INTO skill_nodes (id, name, type, requires_id, effect, col, row, class_restriction) VALUES
  ('fireball',       'Fireball',       'active',  NULL,            '{}',              0,  0, 'Mage'),
  ('arcane_focus',   'Arcane Focus',   'passive', 'fireball',      '{"atk_pct":10}',  -1, 1, 'Mage'),
  ('glass_cannon',   'Glass Cannon',   'passive', 'arcane_focus',  '{"crit":10}',     -1, 2, 'Mage'),
  ('meteor',         'Meteor',         'active',  'glass_cannon',  '{}',              -1, 3, 'Mage'),
  ('mana_shield',    'Mana Shield',    'passive', 'fireball',      '{"def":8}',        1, 1, 'Mage'),
  ('arcane_mastery', 'Arcane Mastery', 'passive', 'mana_shield',   '{"atk_pct":10}',   1, 2, 'Mage');

-- Paladin tree
INSERT INTO skill_nodes (id, name, type, requires_id, effect, col, row, class_restriction) VALUES
  ('holy_smite',    'Holy Smite',    'active',  NULL,          '{}',              0,  0, 'Paladin'),
  ('sacred_vow',    'Sacred Vow',    'passive', 'holy_smite',  '{"hp_pct":15}',  -1,  1, 'Paladin'),
  ('devotion',      'Devotion',      'passive', 'sacred_vow',  '{"def":5}',      -1,  2, 'Paladin'),
  ('divine_shield', 'Divine Shield', 'active',  'devotion',    '{}',             -1,  3, 'Paladin'),
  ('radiance',      'Radiance',      'passive', 'holy_smite',  '{"atk_pct":8}',   1,  1, 'Paladin'),
  ('consecration',  'Consecration',  'passive', 'radiance',    '{"crit":5}',      1,  2, 'Paladin');

-- Seed starting nodes for existing Mage/Paladin characters
INSERT INTO character_skill_nodes (character_id, node_id)
  SELECT id, 'fireball' FROM characters WHERE class = 'Mage'
  ON CONFLICT DO NOTHING;

INSERT INTO character_skill_nodes (character_id, node_id)
  SELECT id, 'holy_smite' FROM characters WHERE class = 'Paladin'
  ON CONFLICT DO NOTHING;

-- Fix equipped_skill for Mage/Paladin characters still pointing to 'whirlwind'
UPDATE characters SET equipped_skill = 'fireball'   WHERE class = 'Mage'    AND equipped_skill = 'whirlwind';
UPDATE characters SET equipped_skill = 'holy_smite' WHERE class = 'Paladin' AND equipped_skill = 'whirlwind';
