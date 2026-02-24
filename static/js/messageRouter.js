/**
 * Thin message dispatch layer — routes server messages to focused handlers.
 */

import { handlePhaseMessage } from './handlers/phaseHandlers.js';
import { handleIntelMessage } from './handlers/intelHandlers.js';
import { handleContentionMessage } from './handlers/contentionHandlers.js';
import { handleCombatMessage } from './handlers/combatHandlers.js';
import { handleLifecycleMessage } from './handlers/lifecycleHandlers.js';
import { handleStateSync } from './handlers/syncHandler.js';
import { showToast } from './ui/toast.js';

const ROUTE = {
    room_state: handlePhaseMessage,
    game_start: handlePhaseMessage,
    deal_hand: handlePhaseMessage,
    phase_change: handlePhaseMessage,
    draw_cards: handlePhaseMessage,
    hand_count_update: handlePhaseMessage,

    card_played: handleCombatMessage,
    action_effect: handleCombatMessage,
    coerce_choose: handleCombatMessage,
    coerce_waiting: handleCombatMessage,
    coerce_pending: handleCombatMessage,

    intel_transmitted: handleIntelMessage,
    intel_moved: handleIntelMessage,
    intel_accepted: handleIntelMessage,
    intel_received: handleIntelMessage,

    contention_start: handleContentionMessage,
    contention_timer_sync: handleContentionMessage,
    contention_pending: handleContentionMessage,
    decoy_choose_direction: handleContentionMessage,
    contention_result: handleContentionMessage,

    dying: handleLifecycleMessage,
    rescue_ask: handleLifecycleMessage,
    player_saved: handleLifecycleMessage,
    player_died: handleLifecycleMessage,
    player_eliminated: handleLifecycleMessage,
    death_gift_prompt: handleLifecycleMessage,
    death_gift_received: handleLifecycleMessage,
    death_gift_given: handleLifecycleMessage,
    game_over: handleLifecycleMessage,
    player_disconnected: handleLifecycleMessage,

    game_state_sync: handleStateSync,
};

export function handleServerMessage(data) {
    const handler = ROUTE[data.type];
    if (handler) handler(data);
    else if (data.type === 'error') showToast(data.message, 2000);
    else console.warn('Unknown message:', data.type);
}
