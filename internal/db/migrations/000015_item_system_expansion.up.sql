-- Expand item_templates
ALTER TABLE item_templates
  ADD COLUMN IF NOT EXISTS crit_bonus  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cdr_bonus   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'expedition';

ALTER TABLE item_templates
  DROP CONSTRAINT IF EXISTS item_templates_slot_check;
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_slot_check
  CHECK (slot IN ('Helmet','Armor','Weapon','Boots','Ring','Amulet'));

ALTER TABLE item_templates
  DROP CONSTRAINT IF EXISTS item_templates_rarity_check;
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_rarity_check
  CHECK (rarity IN ('Common','Uncommon','Rare','Epic'));

ALTER TABLE item_templates
  DROP CONSTRAINT IF EXISTS item_templates_source_check;
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_source_check
  CHECK (source IN ('expedition','dungeon'));

-- Expand equipment slots
ALTER TABLE equipment
  DROP CONSTRAINT IF EXISTS equipment_slot_check;
ALTER TABLE equipment
  ADD CONSTRAINT equipment_slot_check
  CHECK (slot IN ('Helmet','Armor','Weapon','Boots','Ring','Amulet'));

-- Add completed status to expedition_runs
ALTER TABLE expedition_runs
  DROP CONSTRAINT IF EXISTS expedition_runs_status_check;
ALTER TABLE expedition_runs
  ADD CONSTRAINT expedition_runs_status_check
  CHECK (status IN ('active','paused','completed'));
