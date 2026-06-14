DELETE FROM item_templates WHERE source = 'raid';

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
