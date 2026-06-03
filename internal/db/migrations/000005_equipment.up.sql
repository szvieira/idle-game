CREATE TABLE equipment (
    character_id      UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot              TEXT NOT NULL CHECK (slot IN ('Helmet', 'Armor', 'Weapon')),
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    PRIMARY KEY (character_id, slot)
);
