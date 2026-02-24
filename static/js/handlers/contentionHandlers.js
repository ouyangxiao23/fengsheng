/**
 * Contention message handlers: contention_start, contention_timer_sync,
 * contention_pending, decoy_choose_direction, contention_result.
 *
 * Also owns the contention timer (setInterval/clearInterval logic).
 */

import { getState, update, addLog } from '../state.js';
import { getName } from '../constants.js';
import { hand } from '../cardZones.js';
import { renderStage, renderHand, renderTable, createCardElement } from '../render/index.js';
import { animateIntelAlongArc, showPlayedCard } from '../animations.js';

// ── Contention Timer ──────────────────────────────────────

let contentionInterval = null;
let contentionTimerTotal = 7; // default, updated from server

export function startContentionCountdown(seconds) {
    stopContentionCountdown();
    const st = getState();
    st.game.contention.timerSeconds = seconds;
    contentionTimerTotal = seconds;
    contentionInterval = setInterval(() => {
        const s = getState();
        s.game.contention.timerSeconds = Math.max(0, s.game.contention.timerSeconds - 0.1);
        renderContentionTimer();
    }, 100);
}

export function stopContentionCountdown() {
    if (contentionInterval) {
        clearInterval(contentionInterval);
        contentionInterval = null;
    }
}

export function renderContentionTimer() {
    const st = getState();
    const c = st.game.contention;
    const timerEl = document.getElementById('contention-timer');
    if (!timerEl) return;
    const fill = timerEl.querySelector('.contention-timer-fill');
    const text = timerEl.querySelector('.contention-timer-text');
    if (!c.active) {
        timerEl.classList.add('hidden');
        return;
    }
    timerEl.classList.remove('hidden');
    const pct = Math.max(0, (c.timerSeconds / contentionTimerTotal) * 100);
    if (fill) {
        fill.style.width = pct + '%';
        fill.classList.toggle('timer-paused', c.timerPaused);
    }
    if (text) {
        text.textContent = c.timerSeconds > 0 ? Math.ceil(c.timerSeconds) + 's' : '';
    }
}

// ── Message Handler ─────────────────────────────────────────

export function handleContentionMessage(data) {
    switch (data.type) {
        case 'contention_start':
            update('game.contention', {
                active: true,
                timerSeconds: data.timer_seconds,
                timerPaused: false,
                pendingEffect: null,
                pendingPlayer: null,
            });
            startContentionCountdown(data.timer_seconds);
            addLog(`${getName(data.receiver)} 将接收情报，争夺开始！`);
            renderStage();
            renderHand();
            break;

        case 'contention_timer_sync':
            if (data.seconds > 0) {
                update('game.contention.timerSeconds', data.seconds);
                update('game.contention.timerPaused', false);
                startContentionCountdown(data.seconds);
            } else {
                stopContentionCountdown();
            }
            renderStage();
            break;

        case 'contention_pending':
            update('game.contention.pendingEffect', data.effect);
            update('game.contention.pendingPlayer', data.player_id);
            update('game.contention.timerPaused', true);
            if (data.effect === 'decoy') {
                addLog(`${getName(data.player_id)} 使用了误导，选择方向中...`);
            }
            renderStage();
            renderHand();
            break;

        case 'decoy_choose_direction':
            update('ui.targetMode', 'decoy_direction');
            renderStage();
            break;

        case 'contention_result':
            handleContentionResult(data);
            break;
    }
}

// ── Contention Results ──────────────────────────────────────

function handleContentionResult(data) {
    switch (data.effect) {
        case 'intercept': {
            const oldReceiver = data.old_receiver;
            addLog(`${getName(data.player_id)} 截获了情报！`);
            update('game.intel.acceptedBy', data.player_id);
            update('game.intel.facing', data.player_id);
            // Animate intel card from old receiver to interceptor
            animateIntelAlongArc(oldReceiver, data.player_id, () => {
                renderStage();
                renderTable();
                renderHand();
            }, 'straight');
            break;
        }
        case 'switch': {
            // Switch is instant — the played card replaced the intel,
            // old intel arrives as new_hand_card
            if (data.new_hand_card) {
                hand.add(data.new_hand_card);
                addLog(`你调包了情报`);
            } else {
                addLog(`${getName(data.player_id)} 调包了情报`);
            }
            // Reveal the old intel card that was replaced
            if (data.old_intel) {
                showPlayedCard(data.player_id, createCardElement(data.old_intel));
            }
            renderStage();
            renderHand();
            break;
        }
        case 'decoy': {
            // Clear pending state
            update('game.contention.pendingEffect', null);
            update('game.contention.pendingPlayer', null);
            update('game.contention.timerPaused', false);
            update('ui.targetMode', null);
            const oldReceiver = data.old_receiver;
            const newReceiver = data.new_receiver;
            const dirLabel = data.direction === 'left' ? '←左' : '→右';
            addLog(`${getName(data.player_id)} 误导情报 ${dirLabel} → ${getName(newReceiver)}`);
            update('game.intel.acceptedBy', newReceiver);
            update('game.intel.facing', newReceiver);
            // Animate intel card from old receiver to new receiver along the arc
            animateIntelAlongArc(oldReceiver, newReceiver, () => {
                renderStage();
                renderTable();
                renderHand();
            }, data.direction);
            break;
        }
    }
}
