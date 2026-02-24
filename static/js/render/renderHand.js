/**
 * Hand rendering — card fan layout, selection, card element creation.
 */

import { getState } from '../state.js';
import { colorName } from '../constants.js';

// Track which card IDs have already been rendered (for entrance animation)
const seenHandCardIds = new Set();

/** Clear seen card IDs (for reconnect state sync). */
export function resetSeenCards() {
    seenHandCardIds.clear();
}

export function renderHand() {
    const st = getState();
    const g = st.game;
    const container = document.getElementById('my-hand');
    const cards = g.myHand;

    container.innerHTML = '';
    if (cards.length === 0) {
        container.innerHTML = '<span class="hand-empty">无手牌</span>';
        // Clean seen set
        seenHandCardIds.clear();
        return;
    }

    // Prune seenHandCardIds — remove IDs no longer in hand
    const currentIds = new Set(cards.map(c => c.id));
    for (const id of seenHandCardIds) {
        if (!currentIds.has(id)) seenHandCardIds.delete(id);
    }

    const containerW = container.clientWidth || 340;
    const containerH = container.clientHeight || 160;
    const n = cards.length;
    const cardW = 72;
    const cardH = 108;

    // Arc fan: spread adapts to card count
    // Wider spread for better visual separation
    const arcDeg = n === 1 ? 0 : Math.min(60, 8 * (n - 1));
    const arcRad = arcDeg * Math.PI / 180;
    const R = 380;
    // Pivot: place fan so card tops appear near the top of the container.
    // containerH is ~130px; cards are 108px tall; we want cards to fill the box.
    const pivotX = containerW / 2;
    const pivotY = containerH + R - 30;  // 30px clearance from bottom

    // Count new cards for stagger delay
    let newCardIndex = 0;

    for (let i = 0; i < n; i++) {
        const card = cards[i];
        const wrap = document.createElement('div');
        wrap.className = 'hand-card-wrap';
        wrap.dataset.cardId = card.id;

        // Compute fan angle — evenly distribute around -PI/2 (straight up)
        let angleFraction = n === 1 ? 0 : (i / (n - 1)) - 0.5;
        const angle = -Math.PI / 2 + arcRad * angleFraction;
        // Point on the arc circle
        const cx = pivotX + R * Math.cos(angle);
        const cy = pivotY + R * Math.sin(angle);
        const rotateDeg = (angle + Math.PI / 2) * 180 / Math.PI;

        // Center the card on the arc point (offset by half card size)
        const left = cx - cardW / 2;
        const bottom = containerH - cy - cardH / 2;

        wrap.style.left = left + 'px';
        wrap.style.bottom = bottom + 'px';
        wrap.style.transform = `rotate(${rotateDeg}deg)`;
        wrap.style.setProperty('--fan-rotate', `rotate(${rotateDeg}deg)`);
        wrap.style.zIndex = i + 1;

        // Entrance animation for newly seen cards
        const isNewCard = !seenHandCardIds.has(card.id);
        if (isNewCard) {
            wrap.classList.add('card-entering');
            wrap.style.setProperty('--enter-delay', `${newCardIndex * 0.08}s`);
            seenHandCardIds.add(card.id);
            newCardIndex++;
        }

        if (st.ui.selectedCardId === card.id) {
            wrap.classList.add('card-selected-wrap');
        }

        const playable = isCardPlayable(card, g, st);
        if (playable) {
            wrap.classList.add('card-playable-wrap');
        }

        const cardEl = createCardElement(card, !playable);
        wrap.appendChild(cardEl);
        container.appendChild(wrap);
    }
}

/**
 * Lightweight selection update — toggles CSS classes on existing DOM
 * without rebuilding. Preserves hover state and avoids visual pops.
 */
export function updateHandSelection() {
    const st = getState();
    const selectedId = st.ui.selectedCardId;
    document.querySelectorAll('.hand-card-wrap').forEach(w => {
        w.classList.toggle('card-selected-wrap', w.dataset.cardId === selectedId);
    });
}

export function isCardPlayable(card, game, st) {
    const isMyTurn = game.currentPlayer === st.myId;

    // Coerce give mode: only matching cards are playable
    if (st.ui.targetMode === 'coerce_give') {
        const matchingIds = st.ui.pendingExtra?.matchingIds || [];
        return matchingIds.includes(card.id);
    }

    if (game.phase === 'action' && isMyTurn && card.action_phase === 'action') return true;
    if (game.phase === 'transmission' && isMyTurn && !game.intel.active
        && !st.ui.targetMode) return true;
    if (game.phase === 'contention' && game.contention.active
        && !game.contention.pendingEffect
        && card.action_phase === 'contention') return true;
    if (game.phase === 'dying' && game.dying.askingPlayer === st.myId
        && card.action_effect === 'clarify') return true;

    return false;
}

export function createCardElement(card, dimmed = false) {
    const el = document.createElement('div');
    el.className = `card card-${card.intel_color}`;
    if (dimmed) el.classList.add('card-dimmed');

    const phaseText = card.action_phase === 'action' ? '出牌' : '争夺';

    // Direction arrow: clean CSS arrows
    const dirLabel = card.direction === 'left' ? '←' : card.direction === 'right' ? '→' : '↑';
    const dirTitle = card.direction === 'left' ? '左传' : card.direction === 'right' ? '右传' : '直达';

    // Build attribute badges
    let badgesHtml = `<span class="card-badge card-badge-dir" title="${dirTitle}">${dirLabel}</span>`;
    if (card.has_lock) badgesHtml += '<span class="card-badge card-badge-lock" title="锁定">🔒</span>';

    el.innerHTML = `
        <div class="card-header">
            <span class="card-phase-tag">${phaseText}</span>
            <span class="card-name">${card.action_name}</span>
        </div>
        <div class="card-icon">${card.icon}</div>
        <div class="card-footer">
            <div class="card-badges">${badgesHtml}</div>
        </div>
    `;
    return el;
}
