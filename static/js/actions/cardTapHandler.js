/**
 * Card-in-hand tap logic — handles all card selection and play actions.
 */

import { getState, update } from '../state.js';
import { send } from '../ws.js';
import { renderHand, renderStage, updateHandSelection } from '../render/index.js';
import { showTargetPicker } from './targetHandler.js';

export function handleCardTap(wrap, st) {
    const cardId = wrap.dataset.cardId;
    const g = st.game;
    const card = g.myHand.find(c => c.id === cardId);
    if (!card) return;

    const isMyTurn = g.currentPlayer === st.myId;

    // Gift mode: toggle card selection
    if (st.ui.targetMode === 'gift') {
        let giftCards = [...st.ui.giftCards];
        if (giftCards.includes(cardId)) {
            giftCards = giftCards.filter(id => id !== cardId);
        } else if (giftCards.length < 3) {
            giftCards.push(cardId);
        }
        update('ui.giftCards', giftCards);
        // Highlight selected cards
        document.querySelectorAll('.hand-card-wrap').forEach(w => {
            w.classList.toggle('card-selected-wrap', giftCards.includes(w.dataset.cardId));
        });
        return;
    }

    // Coerce give mode: only matching cards can be tapped
    if (st.ui.targetMode === 'coerce_give') {
        const matchingIds = st.ui.pendingExtra?.matchingIds || [];
        if (matchingIds.includes(cardId)) {
            send({ type: 'coerce_response', card_id: cardId });
            update('ui.targetMode', null);
            update('ui.pendingExtra', null);
            renderStage();
        }
        return;
    }

    // If already selected, deselect
    if (st.ui.selectedCardId === cardId) {
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingExtra', null);
        renderHand();
        renderStage();
        return;
    }

    // Select the card
    update('ui.selectedCardId', cardId);

    // ── Action Phase ──
    if (g.phase === 'action' && isMyTurn && card.action_phase === 'action') {
        // Probe: pick target
        if (card.action_effect === 'probe') {
            update('ui.targetMode', 'probe');
            update('ui.pendingAction', card);
            updateHandSelection();
            renderStage();
            return;
        }
        // Coerce step 1: pick target
        if (card.action_effect === 'coerce') {
            update('ui.targetMode', 'coerce');
            update('ui.pendingAction', card);
            update('ui.pendingExtra', null);
            updateHandSelection();
            renderStage();
            return;
        }
        // Clarify step 1: pick target
        if (card.action_effect === 'clarify') {
            update('ui.targetMode', 'clarify');
            update('ui.pendingAction', card);
            update('ui.pendingExtra', null);
            updateHandSelection();
            renderStage();
            return;
        }
        // No target needed — should not happen with current card set
        send({ type: 'action_play_card', card_id: cardId });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        return;
    }

    // ── Transmission Phase ──
    if (g.phase === 'transmission' && isMyTurn && !g.intel.active) {
        // Always show target picker — direction is fixed by card
        showTargetPicker(card);
        renderHand();
        return;
    }

    // ── Contention Phase (simultaneous) ──
    if (g.phase === 'contention' && g.contention.active
        && !g.contention.pendingEffect
        && card.action_phase === 'contention') {
        send({ type: 'contention_play', card_id: cardId });
        update('ui.selectedCardId', null);
        renderStage();
        return;
    }

    // ── Dying Phase (Clarify) ──
    if (g.phase === 'dying' && g.dying.askingPlayer === st.myId
        && card.action_effect === 'clarify') {
        send({ type: 'clarify_play', card_id: cardId });
        update('ui.selectedCardId', null);
        renderStage();
        return;
    }

    updateHandSelection();
}
