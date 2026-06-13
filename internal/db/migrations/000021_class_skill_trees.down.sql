-- Revert equipped_skill
UPDATE characters SET equipped_skill = 'whirlwind' WHERE class = 'Mage'    AND equipped_skill = 'fireball';
UPDATE characters SET equipped_skill = 'whirlwind' WHERE class = 'Paladin' AND equipped_skill = 'holy_smite';

-- Remove seeded nodes for Mage/Paladin
DELETE FROM character_skill_nodes WHERE node_id IN
  ('fireball','arcane_focus','glass_cannon','meteor','mana_shield','arcane_mastery',
   'holy_smite','sacred_vow','devotion','divine_shield','radiance','consecration');

-- Remove new nodes
DELETE FROM skill_nodes WHERE id IN
  ('fireball','arcane_focus','glass_cannon','meteor','mana_shield','arcane_mastery',
   'holy_smite','sacred_vow','devotion','divine_shield','radiance','consecration');

-- Revert Warrior nodes
UPDATE skill_nodes SET col = 0, row = 0, class_restriction = NULL WHERE id = 'whirlwind';
UPDATE skill_nodes SET col = 0, row = 0, class_restriction = NULL WHERE id IN ('brute_force','fury','charge','iron_skin','vigor');

ALTER TABLE skill_nodes
  DROP COLUMN IF EXISTS col,
  DROP COLUMN IF EXISTS row,
  DROP COLUMN IF EXISTS class_restriction;
