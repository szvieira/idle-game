package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

// ── GET /shop?character_id={id} ──────────────────────────────────────────────

type shopItemResponse struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Slot             string  `json:"slot"`
	Rarity           string  `json:"rarity"`
	ShopPrice        int     `json:"shop_price"`
	AttackBonus      int     `json:"attack_bonus"`
	DefenseBonus     int     `json:"defense_bonus"`
	HPBonus          int     `json:"hp_bonus"`
	CritBonus        int     `json:"crit_bonus"`
	CDRBonus         int     `json:"cdr_bonus"`
	ClassRestriction *string `json:"class_restriction,omitempty"`
}

func (s *server) handleGetShopItems(w http.ResponseWriter, r *http.Request) {
	charID := r.URL.Query().Get("character_id")
	if charID == "" {
		writeError(w, http.StatusBadRequest, "character_id required")
		return
	}

	var charClass string
	err := s.pool.QueryRow(r.Context(), `SELECT class FROM characters WHERE id = $1`, charID).Scan(&charClass)
	if err != nil {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}

	rows, err := s.pool.Query(r.Context(), `
		SELECT id, name, slot, rarity, shop_price,
		       attack_bonus, defense_bonus, hp_bonus, crit_bonus, cdr_bonus,
		       class_restriction
		FROM item_templates
		WHERE shop_price IS NOT NULL
		ORDER BY shop_price, name
	`)
	if err != nil {
		log.Printf("shop items: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch shop items")
		return
	}
	defer rows.Close()

	items := []shopItemResponse{}
	for rows.Next() {
		var it shopItemResponse
		if err := rows.Scan(
			&it.ID, &it.Name, &it.Slot, &it.Rarity, &it.ShopPrice,
			&it.AttackBonus, &it.DefenseBonus, &it.HPBonus, &it.CritBonus, &it.CDRBonus,
			&it.ClassRestriction,
		); err != nil {
			log.Printf("scan shop item: %v", err)
			continue
		}
		// Filter out class-restricted items this character can't use
		if it.ClassRestriction != nil && *it.ClassRestriction != "" {
			if !strings.Contains(*it.ClassRestriction, charClass) {
				continue
			}
		}
		items = append(items, it)
	}

	writeJSON(w, http.StatusOK, items)
}

// ── POST /shop/buy ────────────────────────────────────────────────────────────

type shopBuyRequest struct {
	CharacterID    string `json:"character_id"`
	ItemTemplateID string `json:"item_template_id"`
}

func (s *server) handleShopBuy(w http.ResponseWriter, r *http.Request) {
	var req shopBuyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CharacterID == "" || req.ItemTemplateID == "" {
		writeError(w, http.StatusBadRequest, "character_id and item_template_id required")
		return
	}

	// Load character gold + class
	var gold int
	var charClass string
	err := s.pool.QueryRow(r.Context(), `SELECT gold, class FROM characters WHERE id = $1`, req.CharacterID).
		Scan(&gold, &charClass)
	if err != nil {
		writeError(w, http.StatusNotFound, "character not found")
		return
	}

	// Load item template
	var price int
	var classRestriction *string
	err = s.pool.QueryRow(r.Context(), `
		SELECT shop_price, class_restriction FROM item_templates WHERE id = $1 AND shop_price IS NOT NULL
	`, req.ItemTemplateID).Scan(&price, &classRestriction)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not available in shop")
		return
	}

	// Class restriction check
	if classRestriction != nil && *classRestriction != "" {
		if !strings.Contains(*classRestriction, charClass) {
			writeError(w, http.StatusForbidden, "your class cannot use this item")
			return
		}
	}

	// Afford check
	if gold < price {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("not enough gold (need %d, have %d)", price, gold))
		return
	}

	// Deduct gold + create inventory item
	_, err = s.pool.Exec(r.Context(), `UPDATE characters SET gold = gold - $1 WHERE id = $2`, price, req.CharacterID)
	if err != nil {
		log.Printf("shop buy deduct: %v", err)
		writeError(w, http.StatusInternalServerError, "purchase failed")
		return
	}

	_, err = s.pool.Exec(r.Context(), `
		INSERT INTO inventory_items (character_id, item_template_id) VALUES ($1, $2)
	`, req.CharacterID, req.ItemTemplateID)
	if err != nil {
		log.Printf("shop buy insert: %v", err)
		writeError(w, http.StatusInternalServerError, "purchase failed")
		return
	}

	// Return updated character
	sc, loadErr := s.loadCharEffective(r.Context(), req.CharacterID)
	if loadErr != nil {
		writeError(w, http.StatusInternalServerError, "could not reload character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}
