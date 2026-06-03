package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type createAccountRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type accountResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func (s *server) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password required")
		return
	}

	// Placeholder hash — replace with bcrypt when adding login endpoint.
	passwordHash := "hashed:" + req.Password

	var id, email string
	err := s.pool.QueryRow(r.Context(), `
		INSERT INTO accounts (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email
	`, req.Email, passwordHash).Scan(&id, &email)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		log.Printf("create account: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	writeJSON(w, http.StatusCreated, accountResponse{ID: id, Email: email})
}
