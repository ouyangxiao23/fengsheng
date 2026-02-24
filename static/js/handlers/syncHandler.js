/**
 * State sync handler (reconnect).
 *
 * Bug fix: Uses hand.replace() + resetSeenCards() instead of
 * mergeGame({myHand: ...}) so card zone tracking stays consistent.
 */

import { getState, update, mergeGame } from '../state.js';
import { hand } from '../cardZones.js';
import { renderAll, resetSeenCards } from '../render/index.js';

export function handleStateSync(data) {
    mergeGame({
        started: true,
        myIdentity: data.your_identity,
        myIntel: data.your_intel,
        phase: data.phase,
        currentPlayer: data.current_player,
        turnOrder: data.turn_order,
        playerNames: data.player_names,
    });

    // Use hand.replace instead of mergeGame for proper card zone tracking
    hand.replace(data.your_hand);
    resetSeenCards();

    const syncPlayers = {};
    for (const [pid, p] of Object.entries(data.players)) {
        syncPlayers[pid] = {
            handCount: p.hand_count,
            intelArea: p.intel_area,
            alive: p.alive,
        };
    }
    update('game.players', syncPlayers);

    if (data.intel) {
        update('game.intel', {
            active: data.intel.active,
            sender: data.intel.sender,
            direction: data.intel.direction,
            facing: data.intel.facing,
            target: data.intel.target,
            isLocked: data.intel.is_locked,
            lockTarget: data.intel.lock_target,
            acceptedBy: data.intel.accepted_by,
        });
    }

    if (data.dying_player) {
        update('game.dying', {
            active: true,
            player: data.dying_player,
            askingPlayer: data.rescue_asking || null,
        });
    }

    if (data.phase === 'contention') {
        update('game.contention', {
            active: true,
            timerSeconds: 0,
            timerPaused: !!data.contention_pending,
            pendingEffect: data.contention_pending || null,
            pendingPlayer: data.contention_pending_player || null,
        });
        // If pending decoy choice is mine, set target mode
        if (data.contention_pending === 'decoy_direction' && data.contention_pending_player === getState().myId) {
            update('ui.targetMode', 'decoy_direction');
        }
    }

    // Restore coerce state for all players
    if (data.pending_coerce) {
        update('game.coercePending', {
            coercer: data.pending_coerce.coercer,
            target: data.pending_coerce.target,
            cardType: data.pending_coerce.card_type,
        });
    }

    // Restore coerce_give UI if pending
    if (data.pending_coerce && data.pending_coerce.target === getState().myId) {
        update('ui.targetMode', 'coerce_give');
        update('ui.pendingExtra', {
            coercerId: data.pending_coerce.coercer,
            cardType: data.pending_coerce.card_type,
            matchingIds: data.pending_coerce.matching_ids || [],
        });
    }

    document.body.className = 'screen-game';
    renderAll();
}
