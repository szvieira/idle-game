CREATE TABLE skill_nodes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('active','passive')),
  requires_id TEXT REFERENCES skill_nodes(id),
  effect      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE character_skill_nodes (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  node_id      TEXT NOT NULL REFERENCES skill_nodes(id),
  PRIMARY KEY (character_id, node_id)
);

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS equipped_skill TEXT NOT NULL DEFAULT 'whirlwind';

-- Seed skill nodes
-- Left branch: offensive → Charge (new active)
-- Right branch: defensive passives
INSERT INTO skill_nodes (id, name, type, requires_id, effect) VALUES
  ('whirlwind',   'Whirlwind',   'active',  NULL,         '{}'),
  ('brute_force', 'Brute Force', 'passive', 'whirlwind',  '{"atk_pct": 10}'),
  ('fury',        'Fury',        'passive', 'brute_force','{"crit": 5}'),
  ('charge',      'Charge',      'active',  'fury',       '{}'),
  ('iron_skin',   'Iron Skin',   'passive', 'whirlwind',  '{"hp_pct": 15}'),
  ('vigor',       'Vigor',       'passive', 'iron_skin',  '{"def": 4}');

-- Every existing character starts with whirlwind unlocked
INSERT INTO character_skill_nodes (character_id, node_id)
  SELECT id, 'whirlwind' FROM characters
  ON CONFLICT DO NOTHING;
