package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// ── Shared types ──────────────────────────────────────────────────────────────

type itemTemplateResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slot         string `json:"slot"`
	Rarity       string `json:"rarity"`
	Source       string `json:"source"`
	AttackBonus  int    `json:"attack_bonus"`
	DefenseBonus int    `json:"defense_bonus"`
	HPBonus      int    `json:"hp_bonus"`
	CritBonus    int    `json:"crit_bonus"`
	CDRBonus     int    `json:"cdr_bonus"`
}

type inventoryItemResponse struct {
	ID             string               `json:"id"`
	CharacterID    string               `json:"character_id"`
	ItemTemplateID string               `json:"item_template_id"`
	Template       itemTemplateResponse `json:"template"`
}

// ── GET /characters/{id}/inventory ───────────────────────────────────────────

func (s *server) handleGetInventory(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")

	rows, err := s.pool.Query(r.Context(), `
		SELECT ii.id, ii.character_id, ii.item_template_id,
		       it.id, it.name, it.slot, it.rarity, it.source,
		       it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM inventory_items ii
		JOIN item_templates it ON it.id = ii.item_template_id
		WHERE ii.character_id = $1
		ORDER BY ii.acquired_at DESC
	`, charID)
	if err != nil {
		log.Printf("get inventory: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch inventory")
		return
	}
	defer rows.Close()

	items := []inventoryItemResponse{}
	for rows.Next() {
		var item inventoryItemResponse
		if err := rows.Scan(
			&item.ID, &item.CharacterID, &item.ItemTemplateID,
			&item.Template.ID, &item.Template.Name, &item.Template.Slot,
			&item.Template.Rarity, &item.Template.Source,
			&item.Template.AttackBonus, &item.Template.DefenseBonus, &item.Template.HPBonus,
			&item.Template.CritBonus, &item.Template.CDRBonus,
		); err != nil {
			log.Printf("scan inventory row: %v", err)
			writeError(w, http.StatusInternalServerError, "could not fetch inventory")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		log.Printf("inventory rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch inventory")
		return
	}

	writeJSON(w, http.StatusOK, items)
}

// ── POST /characters/{id}/equipment/{slot} ────────────────────────────────────

type equipRequest struct {
	InventoryItemID string `json:"inventory_item_id"`
}

func (s *server) handleEquip(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")
	slot := r.PathValue("slot")

	var req equipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.InventoryItemID == "" {
		writeError(w, http.StatusBadRequest, "inventory_item_id required")
		return
	}

	// Verify item belongs to character and matches slot
	var itemSlot string
	err := s.pool.QueryRow(r.Context(), `
		SELECT it.slot
		FROM inventory_items ii
		JOIN item_templates it ON it.id = ii.item_template_id
		WHERE ii.id = $1 AND ii.character_id = $2
	`, req.InventoryItemID, charID).Scan(&itemSlot)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found in inventory")
		return
	}
	if err != nil {
		log.Printf("equip verify: %v", err)
		writeError(w, http.StatusInternalServerError, "could not verify item")
		return
	}
	if itemSlot != slot {
		writeError(w, http.StatusBadRequest, "item slot does not match")
		return
	}

	// Upsert equipment row
	_, err = s.pool.Exec(r.Context(), `
		INSERT INTO equipment (character_id, slot, inventory_item_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (character_id, slot) DO UPDATE SET inventory_item_id = EXCLUDED.inventory_item_id
	`, charID, slot, req.InventoryItemID)
	if err != nil {
		log.Printf("equip upsert: %v", err)
		writeError(w, http.StatusInternalServerError, "could not equip item")
		return
	}

	sc, err := s.loadCharEffective(r.Context(), charID)
	if err != nil {
		log.Printf("equip load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}

// ── DELETE /characters/{id}/equipment/{slot} ──────────────────────────────────

func (s *server) handleUnequip(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")
	slot := r.PathValue("slot")

	_, err := s.pool.Exec(r.Context(), `
		UPDATE equipment SET inventory_item_id = NULL
		WHERE character_id = $1 AND slot = $2
	`, charID, slot)
	if err != nil {
		log.Printf("unequip: %v", err)
		writeError(w, http.StatusInternalServerError, "could not unequip item")
		return
	}

	sc, err := s.loadCharEffective(r.Context(), charID)
	if err != nil {
		log.Printf("unequip load char: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch character")
		return
	}
	writeJSON(w, http.StatusOK, sc.toResponse())
}

// ── GET /characters/{id}/equipped ─────────────────────────────────────────────

func (s *server) handleGetEquipped(w http.ResponseWriter, r *http.Request) {
	charID := r.PathValue("id")

	rows, err := s.pool.Query(r.Context(), `
		SELECT e.slot,
		       ii.id, ii.character_id, ii.item_template_id,
		       it.id, it.name, it.slot, it.rarity, it.source,
		       it.attack_bonus, it.defense_bonus, it.hp_bonus, it.crit_bonus, it.cdr_bonus
		FROM equipment e
		JOIN inventory_items ii ON ii.id = e.inventory_item_id
		JOIN item_templates  it ON it.id = ii.item_template_id
		WHERE e.character_id = $1
		  AND e.inventory_item_id IS NOT NULL
	`, charID)
	if err != nil {
		log.Printf("get equipped: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch equipment")
		return
	}
	defer rows.Close()

	equipped := map[string]*inventoryItemResponse{}
	for rows.Next() {
		var eSlot string
		var item inventoryItemResponse
		if err := rows.Scan(
			&eSlot,
			&item.ID, &item.CharacterID, &item.ItemTemplateID,
			&item.Template.ID, &item.Template.Name, &item.Template.Slot,
			&item.Template.Rarity, &item.Template.Source,
			&item.Template.AttackBonus, &item.Template.DefenseBonus, &item.Template.HPBonus,
			&item.Template.CritBonus, &item.Template.CDRBonus,
		); err != nil {
			log.Printf("scan equipped row: %v", err)
			writeError(w, http.StatusInternalServerError, "could not fetch equipment")
			return
		}
		itemCopy := item
		equipped[eSlot] = &itemCopy
	}
	if err := rows.Err(); err != nil {
		log.Printf("equipped rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not fetch equipment")
		return
	}

	writeJSON(w, http.StatusOK, equipped)
}
