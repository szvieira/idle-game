UPDATE characters SET class = 'Paladin' WHERE class = 'Priest';
ALTER TABLE characters DROP CONSTRAINT characters_class_check;
ALTER TABLE characters ADD CONSTRAINT characters_class_check
    CHECK (class IN ('Warrior', 'Mage', 'Paladin'));
