ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS shop_price INTEGER DEFAULT NULL;

-- Seed prices on specific items (match by name — they already exist from prior migrations)
UPDATE item_templates SET shop_price = 80  WHERE name = 'Leather Cap';
UPDATE item_templates SET shop_price = 80  WHERE name = 'Leather Vest';
UPDATE item_templates SET shop_price = 100 WHERE name = 'Copper Ring';
UPDATE item_templates SET shop_price = 120 WHERE name = 'Iron Sword';
UPDATE item_templates SET shop_price = 130 WHERE name = 'Wooden Staff';
UPDATE item_templates SET shop_price = 130 WHERE name = 'Holy Mace';
UPDATE item_templates SET shop_price = 150 WHERE name = 'Knight''s Greatsword';
UPDATE item_templates SET shop_price = 180 WHERE name = 'Leather Boots';
UPDATE item_templates SET shop_price = 200 WHERE name = 'Scout''s Helm';
UPDATE item_templates SET shop_price = 200 WHERE name = 'Quartz Amulet';
UPDATE item_templates SET shop_price = 300 WHERE name = 'Soldier''s Sword';
UPDATE item_templates SET shop_price = 350 WHERE name = 'Arcane Tome';
UPDATE item_templates SET shop_price = 350 WHERE name = 'Sacred Plate';
