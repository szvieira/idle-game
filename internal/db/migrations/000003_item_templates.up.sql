CREATE TABLE item_templates (
    id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT  UNIQUE NOT NULL,
    slot           TEXT  NOT NULL CHECK (slot IN ('Helmet', 'Armor', 'Weapon')),
    rarity         TEXT  NOT NULL CHECK (rarity IN ('Common', 'Rare', 'Epic')),
    attack_bonus   INT   NOT NULL DEFAULT 0,
    defense_bonus  INT   NOT NULL DEFAULT 0,
    hp_bonus       INT   NOT NULL DEFAULT 0
);
