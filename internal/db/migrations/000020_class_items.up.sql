-- Add class restriction column
ALTER TABLE item_templates
  ADD COLUMN IF NOT EXISTS class_restriction TEXT DEFAULT NULL;

-- New class-specific items
INSERT INTO item_templates (name, slot, rarity, attack_bonus, defense_bonus, hp_bonus, source, class_restriction) VALUES
  ('Wooden Staff',         'Weapon', 'Common',   3, 0,  0, 'expedition', 'Mage'),
  ('Holy Mace',            'Weapon', 'Uncommon',  4, 0,  0, 'expedition', 'Paladin'),
  ('Knight''s Greatsword', 'Weapon', 'Rare',      7, 0,  0, 'dungeon',    'Warrior'),
  ('Arcane Tome',          'Weapon', 'Rare',      6, 0,  5, 'dungeon',    'Mage'),
  ('Sacred Plate',         'Armor',  'Rare',      0, 5, 10, 'dungeon',    'Paladin')
ON CONFLICT DO NOTHING;

-- Assign class restrictions to existing weapons
UPDATE item_templates SET class_restriction = 'Warrior,Paladin'
  WHERE slot = 'Weapon' AND name IN (
    'Iron Sword','Soldier''s Sword','Crypt Blade','Profane Axe',
    'Shadow Blade','Iron Axe','Warlord''s Edge','Void Blade'
  );

UPDATE item_templates SET class_restriction = 'Mage'
  WHERE slot = 'Weapon' AND name IN ('Bone Staff','Forsaken Staff');

-- Heavy armor: Warrior and Paladin only
UPDATE item_templates SET class_restriction = 'Warrior,Paladin'
  WHERE slot = 'Armor' AND name IN ('Shadow Plate','Iron Cuirass','Warlord''s Plate');

-- Mage robe
UPDATE item_templates SET class_restriction = 'Mage'
  WHERE slot = 'Armor' AND name IN ('Void Mantle');
