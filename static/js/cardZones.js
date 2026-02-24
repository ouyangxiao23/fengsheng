/**
 * Card zone management — enforces single-owner semantics.
 *
 * Every card exists in exactly one zone at a time:
 *   hand   — cards I hold (full card objects, only mine visible)
 *   intel  — received intel markers per player (color only)
 *   table  — the intel being transmitted (tracked by game.intel)
 *   others — other players' hands (count only, no card objects)
 *
 * Moving a card: take() it from one zone, add() it to another.
 * All mutations copy-before-write so state is never left in an
 * inconsistent intermediate form.
 */

import { getState, update } from './state.js';

// ── My Hand ─────────────────────────────────────────────

export const hand = {
    /** Current cards in hand (read-only view). */
    get cards() { return getState().game.myHand; },

    /** Add one or more cards to hand. */
    add(...cards) {
        update('game.myHand', [...this.cards, ...cards]);
    },

    /**
     * Remove a card by ID and return it.
     * Returns null (and logs a warning) if the card isn't in hand —
     * this makes "phantom card" bugs visible immediately.
     */
    take(cardId) {
        const cards = this.cards;
        const card = cards.find(c => c.id === cardId);
        if (!card) {
            console.warn(`[hand.take] Card ${cardId} not found in hand`);
            return null;
        }
        update('game.myHand', cards.filter(c => c.id !== cardId));
        return card;
    },

    /** Replace the entire hand (server full-sync only). */
    replace(cards) {
        update('game.myHand', cards);
    },
};

// ── Intel Areas ─────────────────────────────────────────
//
// For self the source of truth is game.myIntel (detailed cards).
// For rendering, players[pid].intelArea is used for everyone.
// Both are kept in lock-step by these helpers so they can never diverge.

export const intel = {
    /**
     * Add an intel marker to a player's area.
     * Accepts either a color string or a full card object (with id).
     */
    add(playerId, cardOrColor) {
        const marker = typeof cardOrColor === 'string'
            ? { intel_color: cardOrColor }
            : { intel_color: cardOrColor.intel_color, id: cardOrColor.id };
        const p = getState().game.players[playerId];
        if (p) p.intelArea = [...p.intelArea, marker];
        if (playerId === getState().myId) {
            update('game.myIntel', [...getState().game.myIntel, marker]);
        }
    },

    /**
     * Remove the first intel marker of a given color.
     * Handles both players[].intelArea and myIntel atomically.
     */
    remove(playerId, color) {
        const p = getState().game.players[playerId];
        if (p) {
            const area = [...p.intelArea];
            const idx = area.findIndex(c => c.intel_color === color);
            if (idx >= 0) area.splice(idx, 1);
            p.intelArea = area;
        }
        if (playerId === getState().myId) {
            const mi = [...getState().game.myIntel];
            const idx = mi.findIndex(c => c.intel_color === color);
            if (idx >= 0) mi.splice(idx, 1);
            update('game.myIntel', mi);
        }
    },

    /** Remove a specific intel card by ID. */
    removeById(playerId, cardId) {
        const p = getState().game.players[playerId];
        if (p) {
            const area = [...p.intelArea];
            const idx = area.findIndex(c => c.id === cardId);
            if (idx >= 0) area.splice(idx, 1);
            p.intelArea = area;
        }
        if (playerId === getState().myId) {
            const mi = [...getState().game.myIntel];
            const idx = mi.findIndex(c => c.id === cardId);
            if (idx >= 0) mi.splice(idx, 1);
            update('game.myIntel', mi);
        }
    },
};

// ── Player Status ───────────────────────────────────────

export const players = {
    /** Mark a player as dead. Always notifies subscribers. */
    kill(playerId) {
        const map = getState().game.players;
        if (map[playerId]) {
            map[playerId].alive = false;
            update('game.players', map);
        }
    },

    /** Batch-update hand counts from server. Always notifies subscribers. */
    syncHandCounts(counts) {
        const map = getState().game.players;
        for (const [pid, count] of Object.entries(counts)) {
            if (map[pid]) map[pid].handCount = count;
        }
        update('game.players', map);
    },
};
