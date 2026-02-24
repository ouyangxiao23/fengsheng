/**
 * User interaction handlers — card taps, buttons, target selection.
 */

import { getState, update } from './state.js';
import { send } from './ws.js';
import { renderHand, renderStage, renderTable, updateHandSelection } from './render.js';

export function bindActions() {
    // Event delegation on game screen
    document.addEventListener('click', handleClick);
}

function handleClick(e) {
    const st = getState();
    const g = st.game;
    const myId = st.myId;

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

// ── Card Tap Logic ─────────────────────────────────────────

function handleCardTap(wrap, st) {
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
        updateHandSelection();
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
        updateHandSelection();
        // Always show target picker — direction is fixed by card
        showTargetPicker(card);
        return;
    }

    // ── Contention Phase (simultaneous) ──
    if (g.phase === 'contention' && g.contention.active
        && !g.contention.pendingEffect
        && card.action_phase === 'contention') {
        send({ type: 'contention_play', card_id: cardId });
        update('ui.selectedCardId', null);
        return;
    }

    // ── Switch card pick (contention pending) ──
    if (st.ui.targetMode === 'switch_pick') {
        update('ui.switchedCardId', cardId);
        send({ type: 'switch_card', card_id: cardId });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        renderStage();
        renderHand();
        return;
    }

    // ── Dying Phase (Clarify) ──
    if (g.phase === 'dying' && g.dying.askingPlayer === st.myId
        && card.action_effect === 'clarify') {
        send({ type: 'clarify_play', card_id: cardId });
        update('ui.selectedCardId', null);
        return;
    }

    updateHandSelection();
}

// ── Target Selection ───────────────────────────────────────

function handleTargetSelect(targetId, st) {
    const mode = st.ui.targetMode;
    const card = st.ui.pendingAction;

    if (!card) {
        update('ui.targetMode', null);
        return;
    }

    if (mode === 'probe') {
        send({ type: 'action_play_card', card_id: card.id, target_id: targetId });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingAction', null);
        updateHandSelection();
        renderStage();
        return;
    }

    if (mode === 'coerce') {
        // Coerce step 2: show card type picker
        update('ui.targetMode', 'coerce_type');
        update('ui.pendingExtra', { targetId });
        renderStage();
        return;
    }

    if (mode === 'clarify') {
        // Clarify step 2: show intel card picker for target
        const g = st.game;
        const targetPlayer = g.players[targetId];
        if (!targetPlayer || targetPlayer.intelArea.length === 0) {
            update('ui.targetMode', null);
            update('ui.pendingAction', null);
            update('ui.selectedCardId', null);
            updateHandSelection();
            renderStage();
            return;
        }
        update('ui.targetMode', 'clarify_pick');
        update('ui.pendingExtra', {
            targetId,
            intelCards: targetPlayer.intelArea,
        });
        renderStage();
        return;
    }

    if (mode === 'transmit_target') {
        if (card.has_lock) {
            // Lockable card: ask player whether to lock
            update('ui.targetMode', 'transmit_lock');
            update('ui.pendingExtra', { targetId });
            renderStage();
            return;
        }
        update('ui.transmittedCardId', card.id);
        send({
            type: 'transmit_card',
            card_id: card.id,
            target: targetId,
            lock: false,
        });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingAction', null);
        update('ui.pendingExtra', null);
        updateHandSelection();
        renderStage();
        return;
    }
}

// ── Target Picker (Transmission) ──────────────────────────

function showTargetPicker(card) {
    const st = getState();
    const g = st.game;
    const prompt = document.getElementById('stage-prompt');
    const btns = document.getElementById('stage-buttons');

    prompt.textContent = '选择情报传递目标';

    const alivePlayers = g.turnOrder.filter(pid =>
        pid !== st.myId && g.players[pid]?.alive
    );

    btns.innerHTML = alivePlayers.map(pid =>
        `<button class="btn btn-sm btn-secondary" data-transmit-target="${pid}">${g.playerNames[pid]}</button>`
    ).join('');

    update('ui.pendingAction', card);
    update('ui.targetMode', 'transmit_target');
}
