CREATE TABLE inventory_items (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id     UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    item_template_id UUID        NOT NULL REFERENCES item_templates(id),
    upgrade_level    INT         NOT NULL DEFAULT 0,
    acquired_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
