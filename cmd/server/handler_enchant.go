package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// ── POST /enchant ─────────────────────────────────────────────────────────────

type enchantRequest struct {
	EquipmentID string `json:"equipment_id"`
	CharacterID string `json:"character_id"`
}

// enchantedEquipmentResponse mirrors inventoryItemResponse but adds enchant_level.
type enchantedEquipmentResponse struct {
	ID             string               `json:"id"`
	CharacterID    string               `json:"character_id"`
	ItemTemplateID string               `json:"item_template_id"`
	EnchantLevel   int                  `json:"enchant_level"`
	Template       itemTemplateResponse `json:"template"`
}

type enchantResponse struct {
	Gold      int                        `json:"gold"`
	Equipment enchantedEquipmentResponse `json:"equipment"`
}

// maxEnchantForRarity returns the maximum enchant tier for a given rarity string.
func maxEnchantForRarity(rarity string) int {
	switch rarity {
	case "Uncommon":
		return 5
	case "Rare":
		return 8
	case "Epic":
		return 12
	default: // Common
		return 3
	}
}

// enchantCost returns 50 * 3^currentLevel (integer math).
func enchantCost(currentLevel int) int {
	return 50 * int(math.Round(math.Pow(3, float64(currentLevel))))
}

func (s *server) handleEnchant(w http.ResponseWriter, r *http.Request) {
	var req enchantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EquipmentID == "" || req.CharacterID == "" {
		writeError(w, http.StatusBadRequest, "equipment_id and character_id required")
		return
	}

	// 1. Query equipment JOIN item_templates to get current state.
	var (
		enchantLevel int
		rarity       string
		attackBonus  int
		defenseBonus int
		hpBonus      int
		critBonus    int
		cdrBonus     int
		itemID       string
		charID       string
		templateID   string
		templateName string
		slot         string
		source       string
		tID          string
	)

	err := s.pool.QueryRow(r.Context(), `
		SELECT e.inventory_item_id, e.character_id, e.enchant_level,
		       ii.item_template_id,
		       it.id, it.name, it.slot, it.rarity, it.source,
		       it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM equipment e
		JOIN inventory_items ii ON ii.id = e.inventory_item_id
		JOIN item_templates  it ON it.id = ii.item_template_id
		WHERE e.inventory_item_id = $1
		  AND e.character_id = $2
		  AND e.inventory_item_id IS NOT NULL
	`, req.EquipmentID, req.CharacterID).Scan(
		&itemID, &charID, &enchantLevel,
		&templateID,
		&tID, &templateName, &slot, &rarity, &source,
		&attackBonus, &defenseBonus, &hpBonus, &critBonus, &cdrBonus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "equipped item not found")
		return
	}
	if err != nil {
		log.Printf("enchant query: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch equipment")
		return
	}

	// 2. Determine max enchant level and check if already at max.
	maxLevel := maxEnchantForRarity(rarity)
	if enchantLevel >= maxLevel {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("already at max enchant (+%d)", maxLevel))
		return
	}

	// 3. Calculate cost.
	cost := enchantCost(enchantLevel)

	// 4. Check character gold.
	var gold int
	err = s.pool.QueryRow(r.Context(), `SELECT gold FROM characters WHERE id = $1`, req.CharacterID).Scan(&gold)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}
	if err != nil {
		log.Printf("enchant gold query: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	if gold < cost {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("not enough gold (need %d, have %d)", cost, gold))
		return
	}

	// 5. Deduct gold.
	_, err = s.pool.Exec(r.Context(), `UPDATE characters SET gold = gold - $1 WHERE id = $2`, cost, req.CharacterID)
	if err != nil {
		log.Printf("enchant deduct gold: %v", err)
		writeError(w, http.StatusInternalServerError, "enchant failed")
		return
	}

	// 6. Increment enchant_level on equipment row (keyed by character_id + inventory_item_id).
	_, err = s.pool.Exec(r.Context(), `
		UPDATE equipment SET enchant_level = enchant_level + 1
		WHERE character_id = $1 AND inventory_item_id = $2
	`, req.CharacterID, req.EquipmentID)
	if err != nil {
		log.Printf("enchant increment: %v", err)
		writeError(w, http.StatusInternalServerError, "enchant failed")
		return
	}

	newEnchantLevel := enchantLevel + 1
	newGold := gold - cost

	resp := enchantResponse{
		Gold: newGold,
		Equipment: enchantedEquipmentResponse{
			ID:             itemID,
			CharacterID:    charID,
			ItemTemplateID: templateID,
			EnchantLevel:   newEnchantLevel,
			Template: itemTemplateResponse{
				ID:           tID,
				Name:         templateName,
				Slot:         slot,
				Rarity:       rarity,
				Source:       source,
				AttackBonus:  attackBonus,
				DefenseBonus: defenseBonus,
				HPBonus:      hpBonus,
				CritBonus:    critBonus,
				CDRBonus:     cdrBonus,
			},
		},
	}

	writeJSON(w, http.StatusOK, resp)
}
