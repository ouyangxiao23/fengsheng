/**
 * User interaction handlers — click delegation and button handlers.
 */

import { getState, update } from '../state.js';
import { send } from '../ws.js';
import { renderHand, renderStage, updateHandSelection } from '../render/index.js';
import { handleCardTap } from './cardTapHandler.js';
import { handleTargetSelect } from './targetHandler.js';

export function bindActions() {
    // Event delegation on game screen
    document.addEventListener('click', handleClick);
}

function handleClick(e) {
    const st = getState();

    // ── Card in hand tapped ──────────────────────────────
    const cardWrap = e.target.closest('.hand-card-wrap');
    if (cardWrap) {
        handleCardTap(cardWrap, st);
        return;
    }

    // ── Avatar tapped (for targeting) ────────────────────
    const avatarWrap = e.target.closest('.avatar-wrap');
    if (avatarWrap && st.ui.targetMode) {
        const targetId = avatarWrap.dataset.playerId;
        handleTargetSelect(targetId, st);
        return;
    }

    // ── Stage buttons ────────────────────────────────────
    const btn = e.target.closest('button');
    if (!btn) return;

    const id = btn.id;

    // Action phase: Done
    if (id === 'btn-action-done') {
        send({ type: 'action_done' });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingExtra', null);
        return;
    }

    // Transmission: Accept / Pass
    if (id === 'btn-accept') {
        send({ type: 'accept_intel' });
        return;
    }
    if (id === 'btn-pass') {
        send({ type: 'pass_intel' });
        return;
    }

    // Decoy direction buttons
    if (btn.dataset.decoyDirection) {
        send({ type: 'decoy_direction', direction: btn.dataset.decoyDirection });
        update('ui.targetMode', null);
        renderStage();
        return;
    }

    // Rescue: Pass
    if (id === 'btn-rescue-pass') {
        send({ type: 'clarify_pass' });
        return;
    }

    // Coerce type selection buttons
    if (btn.dataset.coerceType) {
        const card = st.ui.pendingAction;
        const targetId = st.ui.pendingExtra?.targetId;
        if (card && targetId) {
            send({
                type: 'action_play_card',
                card_id: card.id,
                target_id: targetId,
                card_type: btn.dataset.coerceType,
            });
            update('ui.selectedCardId', null);
            update('ui.targetMode', null);
            update('ui.pendingAction', null);
            update('ui.pendingExtra', null);
            updateHandSelection();
            renderStage();
        }
        return;
    }

    // Clarify intel card selection buttons
    if (btn.dataset.intelCardId) {
        const card = st.ui.pendingAction;
        const targetId = st.ui.pendingExtra?.targetId;
        if (card && targetId) {
            send({
                type: 'action_play_card',
                card_id: card.id,
                target_id: targetId,
                intel_card_id: btn.dataset.intelCardId,
            });
            update('ui.selectedCardId', null);
            update('ui.targetMode', null);
            update('ui.pendingAction', null);
            update('ui.pendingExtra', null);
            updateHandSelection();
            renderStage();
        }
        return;
    }

    // Transmission target selection
    if (btn.dataset.transmitTarget !== undefined && st.ui.targetMode === 'transmit_target') {
        handleTargetSelect(btn.dataset.transmitTarget, st);
        return;
    }

    // Lock choice buttons
    if (btn.dataset.lockChoice !== undefined && st.ui.targetMode === 'transmit_lock') {
        const card = st.ui.pendingAction;
        const targetId = st.ui.pendingExtra?.targetId;
        if (card && targetId) {
            update('ui.transmittedCardId', card.id);
            send({
                type: 'transmit_card',
                card_id: card.id,
                target: targetId,
                lock: btn.dataset.lockChoice === '1',
            });
            update('ui.selectedCardId', null);
            update('ui.targetMode', null);
            update('ui.pendingAction', null);
            update('ui.pendingExtra', null);
            updateHandSelection();
            renderStage();
        }
        return;
    }

    // Gift player selection
    if (btn.classList.contains('gift-player-btn')) {
        document.querySelectorAll('.gift-player-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        update('ui.giftRecipient', btn.dataset.pid);
        return;
    }

    // Gift confirm
    if (id === 'btn-gift-confirm') {
        const giftCards = st.ui.giftCards;
        const recipient = st.ui.giftRecipient;
        if (recipient && giftCards.length > 0) {
            send({ type: 'death_gift', card_ids: giftCards, recipient_id: recipient });
            document.querySelector('.gift-ui')?.remove();
        }
        return;
    }

    // Gift skip
    if (id === 'btn-gift-skip') {
        send({ type: 'death_gift', card_ids: [], recipient_id: null });
        document.querySelector('.gift-ui')?.remove();
        return;
    }

    // Card modal close
    if (e.target.id === 'card-modal-backdrop') {
        document.getElementById('card-modal').classList.add('hidden');
        return;
    }
}
