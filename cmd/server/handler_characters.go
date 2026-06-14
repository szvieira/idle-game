package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"game/internal/character"

	"github.com/jackc/pgx/v5"
)

// ── Shared types ──────────────────────────────────────────────────────────────

type characterResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Class       string  `json:"class"`
	Level       int     `json:"level"`
	XP          int     `json:"xp"`
	XPToNext    int     `json:"xp_to_next"`
	Gold        int     `json:"gold"`
	HP          int     `json:"hp"`
	MaxHP       int     `json:"max_hp"`
	Attack      int     `json:"attack"`
	Defense     int     `json:"defense"`
	Critical    int     `json:"critical"`
	CDR         int     `json:"cdr"`
	SpecialName string  `json:"special_name"`
	SpecialMult float64 `json:"special_mult"`
	SpecialHeal int     `json:"special_heal"`
	SpecialCD   int     `json:"special_cd"`
}

// serverChar holds DB-only fields alongside the combat character.
type serverChar struct {
	id   string
	name string
	gold int
	c    *character.Character
}

func (sc *serverChar) toResponse() characterResponse {
	return characterResponse{
		ID:          sc.id,
		Name:        sc.name,
		Class:       sc.c.Class,
		Level:       sc.c.Level,
		XP:          sc.c.XP,
		XPToNext:    sc.c.XPToNext,
		Gold:        sc.gold,
		HP:          sc.c.HP,
		MaxHP:       sc.c.MaxHP,
		Attack:      sc.c.Attack,
		Defense:     sc.c.Defense,
		Critical:    sc.c.Critical,
		CDR:         sc.c.CDR,
		SpecialName: sc.c.SpecialName,
		SpecialMult: sc.c.SpecialMult,
		SpecialHeal: sc.c.SpecialHeal,
		SpecialCD:   sc.c.SpecialCD,
	}
}

func (s *server) loadChar(ctx context.Context, id string) (*serverChar, error) {
	sc := &serverChar{c: &character.Character{}}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, gold,
		       class, level, xp, xp_to_next,
		       hp, max_hp, attack, defense, critical, cdr
		FROM characters WHERE id = $1
	`, id).Scan(
		&sc.id, &sc.name, &sc.gold,
		&sc.c.Class, &sc.c.Level, &sc.c.XP, &sc.c.XPToNext,
		&sc.c.HP, &sc.c.MaxHP,
		&sc.c.Attack, &sc.c.Defense, &sc.c.Critical, &sc.c.CDR,
	)
	if err != nil {
		return nil, err
	}
	character.ApplyClassSkills(sc.c)
	return sc, nil
}

// loadEquipmentBonuses fetches the stat bonuses of all items equipped by character.
func (s *server) loadEquipmentBonuses(ctx context.Context, charID string) ([]character.EquippedBonus, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM equipment e
		JOIN inventory_items ii ON ii.id = e.inventory_item_id
		JOIN item_templates  it ON it.id = ii.item_template_id
		WHERE e.character_id = $1
		  AND e.inventory_item_id IS NOT NULL
	`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bonuses []character.EquippedBonus
	for rows.Next() {
		var b character.EquippedBonus
		if err := rows.Scan(&b.AttackBonus, &b.DefenseBonus, &b.HPBonus,
			&b.CritBonus, &b.CDRBonus); err != nil {
			return nil, err
		}
		bonuses = append(bonuses, b)
	}
	return bonuses, rows.Err()
}

// loadPassiveSkillEffects fetches and unmarshals effects of all unlocked passive nodes.
func (s *server) loadPassiveSkillEffects(ctx context.Context, charID string) ([]character.SkillEffect, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sn.effect
		FROM character_skill_nodes csn
		JOIN skill_nodes sn ON sn.id = csn.node_id
		WHERE csn.character_id = $1 AND sn.type = 'passive'
	`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var effects []character.SkillEffect
	for rows.Next() {
		var e character.SkillEffect
		if err := rows.Scan(&e); err != nil {
			return nil, err
		}
		effects = append(effects, e)
	}
	return effects, rows.Err()
}

// loadCharEffective loads base char stats and applies equipped item bonuses
// plus passive skill effects.
func (s *server) loadCharEffective(ctx context.Context, id string) (*serverChar, error) {
	sc, err := s.loadChar(ctx, id)
	if err != nil {
		return nil, err
	}
	bonuses, err := s.loadEquipmentBonuses(ctx, id)
	if err != nil {
		return nil, err
	}
	character.ApplyEquipment(sc.c, bonuses)

	effects, err := s.loadPassiveSkillEffects(ctx, id)
	if err != nil {
		return nil, err
	}
	character.ApplyPassiveSkills(sc.c, effects)

	return sc, nil
}

// ── POST /characters ──────────────────────────────────────────────────────────

type createCharacterRequest struct {
	Name  string `json:"name"`
	Class string `json:"class"`
}

func (s *server) handleCreateCharacter(w http.ResponseWriter, r *http.Request) {
	var req createCharacterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}

	var c *character.Character
	switch req.Class {
	case "Warrior":
		c = character.NewWarrior()
	case "Mage":
		c = character.NewMage()
	case "Paladin":
		c = character.NewPaladin()
	default:
		writeError(w, http.StatusBadRequest, "class must be Warrior, Mage, or Paladin")
		return
	}

	var resp characterResponse
	err := s.pool.QueryRow(r.Context(), `
		INSERT INTO characters
			(name, class, level, xp, xp_to_next, gold,
			 hp, max_hp, attack, defense, critical, cdr)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id, name, class, level, xp, xp_to_next, gold,
			hp, max_hp, attack, defense, critical, cdr
	`,
		req.Name, c.Class, c.Level, c.XP, c.XPToNext, 0,
		c.HP, c.MaxHP, c.Attack, c.Defense, c.Critical, c.CDR,
	).Scan(
		&resp.ID, &resp.Name, &resp.Class, &resp.Level, &resp.XP, &resp.XPToNext, &resp.Gold,
		&resp.HP, &resp.MaxHP, &resp.Attack, &resp.Defense, &resp.Critical, &resp.CDR,
	)
	if err != nil {
		log.Printf("create character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create character")
		return
	}

	// Seed starting skill node for new character
	rootSkill := "whirlwind"
	switch req.Class {
	case "Mage":    rootSkill = "fireball"
	case "Paladin": rootSkill = "holy_smite"
	}
	if _, err := s.pool.Exec(r.Context(), `
		INSERT INTO character_skill_nodes (character_id, node_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, resp.ID, rootSkill); err != nil {
		log.Printf("seed starting skill: %v", err)
	}
	if _, err := s.pool.Exec(r.Context(), `
		UPDATE characters SET equipped_skill = $1 WHERE id = $2
	`, rootSkill, resp.ID); err != nil {
		log.Printf("set equipped skill: %v", err)
	}

	writeJSON(w, http.StatusCreated, resp)
}

// ── GET /characters/{id} ─────────────────────────────────────────────────────

func (s *server) handleGetCharacter(w http.ResponseWriter, r *http.Request) {
	sc, err := s.loadCharEffective(r.Context(), r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("get character: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}
