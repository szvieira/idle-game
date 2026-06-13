UPDATE item_templates SET class_restriction = NULL;
ALTER TABLE item_templates DROP COLUMN IF EXISTS class_restriction;
DELETE FROM item_templates WHERE name IN ('Wooden Staff','Holy Mace','Knight''s Greatsword','Arcane Tome','Sacred Plate');
