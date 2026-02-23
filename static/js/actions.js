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

    // Contention: Pass
    if (id === 'btn-contention-pass') {
        send({ type: 'contention_pass' });
        return;
    }

    // Rescue: Pass
    if (id === 'btn-rescue-pass') {
        send({ type: 'clarify_pass' });
        return;
    }

    // Direction selection
    if (btn.classList.contains('direction-btn')) {
        const dir = btn.dataset.direction;
        handleDirectionSelect(dir, st);
        return;
    }

    // Lock target selection
    if (btn.dataset.lockTarget !== undefined) {
        handleLockSelect(btn.dataset.lockTarget, st);
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

    // If already selected, deselect
    if (st.ui.selectedCardId === cardId) {
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        updateHandSelection();
        renderStage();
        return;
    }

    // Select the card
    update('ui.selectedCardId', cardId);

    // ── Action Phase ──
    if (g.phase === 'action' && isMyTurn && card.action_phase === 'action') {
        // Cards requiring target
        if (card.action_effect === 'probe' || card.action_effect === 'coerce') {
            update('ui.targetMode', card.action_effect);
            update('ui.pendingAction', card);
            updateHandSelection();
            renderStage();
            // Prompt in stage
            document.getElementById('stage-prompt').textContent =
                `选择 ${card.action_name} 的目标`;
            return;
        }
        if (card.action_effect === 'clarify') {
            update('ui.targetMode', 'clarify');
            update('ui.pendingAction', card);
            updateHandSelection();
            renderStage();
            document.getElementById('stage-prompt').textContent = '选择要移除黑色情报的玩家';
            return;
        }
        // No target needed (secret_order)
        send({ type: 'action_play_card', card_id: cardId });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        return;
    }

    // ── Transmission Phase ──
    if (g.phase === 'transmission' && isMyTurn && !g.intel.active) {
        updateHandSelection();
        // Need direction for 'any' cards
        if (card.direction === 'any') {
            showDirectionPicker(card);
            return;
        }
        // Fixed direction — check for lock
        if (card.has_lock) {
            showLockPicker(card);
            return;
        }
        // Simple send
        send({ type: 'transmit_card', card_id: cardId });
        update('ui.selectedCardId', null);
        return;
    }

    // ── Contention Phase ──
    if (g.phase === 'contention' && g.contention.askingPlayer === st.myId
        && card.action_phase === 'contention') {
        if (card.action_effect === 'switch') {
            // Need to pick a swap card — for simplicity, prompt selection
            update('ui.targetMode', 'switch');
            update('ui.pendingAction', card);
            updateHandSelection();
            document.getElementById('stage-prompt').textContent = '再选一张手牌来调包';
            return;
        }
        send({ type: 'contention_play', card_id: cardId });
        update('ui.selectedCardId', null);
        return;
    }

    // ── Dying Phase (Clarify) ──
    if (g.phase === 'dying' && g.dying.askingPlayer === st.myId
        && card.action_effect === 'clarify') {
        send({ type: 'clarify_play', card_id: cardId });
        update('ui.selectedCardId', null);
        return;
    }

    // ── Switch second card selection ──
    if (st.ui.targetMode === 'switch' && cardId !== st.ui.pendingAction?.id) {
        const switchCardId = st.ui.pendingAction.id;
        send({ type: 'contention_play', card_id: switchCardId, swap_card_id: cardId });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingAction', null);
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

    if (mode === 'probe' || mode === 'coerce') {
        send({ type: 'action_play_card', card_id: card.id, target_id: targetId });
    } else if (mode === 'clarify') {
        send({ type: 'action_play_card', card_id: card.id, target_id: targetId });
    } else if (mode === 'lock') {
        // Transmit with lock
        const dir = st.ui.pendingDirection;
        send({
            type: 'transmit_card',
            card_id: card.id,
            direction: dir,
            lock_target: targetId,
        });
    }

    update('ui.selectedCardId', null);
    update('ui.targetMode', null);
    update('ui.pendingAction', null);
    updateHandSelection();
    renderStage();
}

// ── Direction & Lock Pickers ───────────────────────────────

function showDirectionPicker(card) {
    const btns = document.getElementById('stage-buttons');
    const prompt = document.getElementById('stage-prompt');
    prompt.textContent = '选择传递方向';

    let html = `
        <button class="direction-btn" data-direction="left">← 左</button>
        <button class="direction-btn" data-direction="right">→ 右</button>
    `;
    btns.innerHTML = html;

    // Store card for when direction is picked
    update('ui.pendingAction', card);
}

function handleDirectionSelect(dir, st) {
    const card = st.ui.pendingAction;
    if (!card) return;

    if (card.has_lock) {
        update('ui.pendingDirection', dir);
        showLockPicker(card, dir);
        return;
    }

    send({ type: 'transmit_card', card_id: card.id, direction: dir });
    update('ui.selectedCardId', null);
    update('ui.pendingAction', null);
}

function showLockPicker(card, direction) {
    const st = getState();
    const g = st.game;
    const prompt = document.getElementById('stage-prompt');
    const btns = document.getElementById('stage-buttons');

    prompt.textContent = '选择锁定目标（或不锁定）';

    const alivePlayers = g.turnOrder.filter(pid =>
        pid !== st.myId && g.players[pid]?.alive
    );

    let html = alivePlayers.map(pid =>
        `<button class="btn btn-sm btn-secondary" data-lock-target="${pid}">${g.playerNames[pid]}</button>`
    ).join('');
    html += `<button class="btn btn-sm btn-accent" data-lock-target="">不锁定</button>`;
    btns.innerHTML = html;

    update('ui.pendingAction', card);
    update('ui.targetMode', 'lock');
    if (direction) update('ui.pendingDirection', direction);
}

function handleLockSelect(lockTarget, st) {
    const card = st.ui.pendingAction;
    if (!card) return;

    const dir = card.direction === 'any' ? (st.ui.pendingDirection || 'left') : undefined;

    send({
        type: 'transmit_card',
        card_id: card.id,
        direction: dir,
        lock_target: lockTarget || undefined,
    });

    update('ui.selectedCardId', null);
    update('ui.pendingAction', null);
    update('ui.targetMode', null);
}
