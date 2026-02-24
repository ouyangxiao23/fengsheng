/**
 * Server message dispatch and game state mutations.
 *
 * All card movements go through cardZones (hand / intel / players)
 * so every card has exactly one owner at any time.
 */

import { getState, update, mergeGame, addLog } from './state.js';
import { IDENTITY_NAMES, IDENTITY_COLORS, getName, colorName } from './constants.js';
import { hand, intel, players } from './cardZones.js';
import { renderLobby } from './lobby.js';
import { renderAll, renderHand, renderStage, renderTable, createCardElement } from './render.js';
import { removeIntelCard, animateIntelAlongArc, animateIntelReveal, animateCardFromHand, showPlayedCard } from './animations.js';

// ── Contention Timer ──────────────────────────────────────

let contentionInterval = null;

function startContentionCountdown(seconds) {
    stopContentionCountdown();
    const st = getState();
    st.game.contention.timerSeconds = seconds;
    contentionInterval = setInterval(() => {
        const s = getState();
        s.game.contention.timerSeconds = Math.max(0, s.game.contention.timerSeconds - 0.1);
        renderContentionTimer();
    }, 100);
}

function stopContentionCountdown() {
    if (contentionInterval) {
        clearInterval(contentionInterval);
        contentionInterval = null;
    }
}

function renderContentionTimer() {
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
    const pct = Math.max(0, (c.timerSeconds / 7) * 100);
    if (fill) {
        fill.style.width = pct + '%';
        fill.classList.toggle('timer-paused', c.timerPaused);
    }
    if (text) {
        text.textContent = c.timerSeconds > 0 ? Math.ceil(c.timerSeconds) + 's' : '';
    }
}

// ── Server Message Dispatcher ──────────────────────────────

export function handleServerMessage(data) {
    const st = getState();
    const type = data.type;

    switch (type) {
        case 'room_state':
            update('roomId', data.room_id);
            update('lobby', {
                players: data.players,
                canStart: data.can_start,
                isHost: data.is_host,
            });
            renderLobby(st);
            break;

        case 'game_start': {
            mergeGame({
                started: true,
                myIdentity: data.your_identity,
                turnOrder: data.turn_order,
                playerNames: data.player_names,
            });
            const initPlayers = {};
            for (const pid of data.turn_order) {
                initPlayers[pid] = { handCount: 0, intelArea: [], alive: true };
            }
            update('game.players', initPlayers);
            document.body.className = 'screen-game';
            renderAll();
            addLog(`游戏开始！你的身份：${IDENTITY_NAMES[data.your_identity]}`);
            break;
        }

        case 'deal_hand':
            hand.replace(data.cards);
            renderHand();
            break;

        case 'phase_change':
            mergeGame({ phase: data.phase, currentPlayer: data.current_player });
            // Don't reset intel.active when entering contention — intel is still on the table
            if (data.phase !== 'contention') {
                update('game.intel.active', false);
                stopContentionCountdown();
                update('game.contention', {
                    active: false,
                    timerSeconds: 0,
                    timerPaused: false,
                    pendingEffect: null,
                    pendingPlayer: null,
                    revealedIntel: null,
                });
                renderContentionTimer();
            }
            if (data.phase === 'dying') {
                // keep dying state
            } else {
                update('game.dying', { active: false, player: null, askingPlayer: null });
            }
            update('ui.selectedCardId', null);
            update('ui.targetMode', null);
            update('ui.pendingExtra', null);
            if (data.phase === 'draw') removeIntelCard();
            // Skip render for contention — contention_start will handle it
            if (data.phase !== 'contention') {
                renderStage();
            }
            renderTable();
            break;

        case 'draw_cards':
            if (data.cards) {
                hand.add(...data.cards);
                addLog(`你摸了${data.cards.length}张牌`);
                renderHand();
            } else {
                addLog(`${getName(data.player_id)} 摸了${data.count}张牌`);
            }
            break;

        case 'hand_count_update':
            players.syncHandCounts(data.counts);
            renderTable();
            break;

        case 'card_played': {
            const who = getName(data.player_id);
            if (data.card) {
                addLog(`${who} 使用了 ${data.card.action_name}`);
                // Show the card face-up near the player's avatar
                showPlayedCard(data.player_id, createCardElement(data.card));
            } else {
                addLog(`${who} 使用了 ${data.action_name || '一张牌'}（暗置）`);
                // Show a card-back near the player's avatar
                const back = document.createElement('div');
                back.className = 'card-back';
                showPlayedCard(data.player_id, back);
            }
            if (data.player_id === getState().myId && data.card) {
                hand.take(data.card.id);
                renderHand();
            }
            break;
        }

        case 'action_effect':
            handleActionEffect(data);
            break;

        case 'intel_transmitted': {
            const senderId = data.sender_id;
            const facingId = data.facing;
            update('game.intel', {
                active: true,
                sender: senderId,
                direction: data.direction,
                facing: facingId,
                target: data.target,
                isLocked: data.is_locked,
                lockTarget: data.is_locked ? data.target : null,
                acceptedBy: null,
            });
            const dirLabel = data.direction === 'left' ? '←左' : data.direction === 'right' ? '→右' : '↑直达';
            addLog(`${getName(senderId)} 传出了情报(${dirLabel}) → ${getName(data.target)}`);

            if (senderId === getState().myId) {
                // Grab card rect before removing it from the DOM
                const txCardId = getState().ui.transmittedCardId;
                const cardEl = txCardId
                    ? document.querySelector(`.hand-card-wrap[data-card-id="${txCardId}"]`)
                    : null;
                const cardRect = cardEl ? cardEl.getBoundingClientRect() : null;

                // Card leaves hand → enters table zone
                if (txCardId) {
                    hand.take(txCardId);
                    update('ui.transmittedCardId', null);
                    renderHand();
                }

                animateCardFromHand(cardRect, senderId, () => {
                    animateIntelAlongArc(senderId, facingId, () => {
                        renderStage();
                        renderTable();
                    }, data.direction);
                });
            } else {
                animateIntelAlongArc(senderId, facingId, () => {
                    renderStage();
                    renderTable();
                }, data.direction);
            }
            break;
        }

        case 'intel_moved': {
            const oldFacing = getState().game.intel.facing;
            const newFacing = data.to_player;
            const dir = getState().game.intel.direction;
            update('game.intel.facing', newFacing);
            addLog(`情报传到 ${getName(newFacing)} 面前`);
            animateIntelAlongArc(oldFacing, newFacing, () => {
                renderStage();
                renderTable();
            }, dir);
            break;
        }

        case 'intel_accepted':
            update('game.intel.acceptedBy', data.player_id);
            addLog(`${getName(data.player_id)} 宣布接收情报`);
            renderStage();
            break;

        case 'contention_start':
            update('game.contention', {
                active: true,
                timerSeconds: data.timer_seconds,
                timerPaused: false,
                pendingEffect: null,
                pendingPlayer: null,
                revealedIntel: null,
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
            if (data.intel_revealed) {
                update('game.contention.revealedIntel', data.intel_revealed);
            }
            if (data.effect === 'decoy') {
                addLog(`${getName(data.player_id)} 使用了误导，选择方向中...`);
            } else if (data.effect === 'switch') {
                addLog(`${getName(data.player_id)} 使用了调包，选择替换牌中...`);
            }
            renderStage();
            renderHand();
            break;

        case 'decoy_choose_direction':
            update('ui.targetMode', 'decoy_direction');
            renderStage();
            break;

        case 'switch_choose_card':
            update('ui.targetMode', 'switch_pick');
            renderStage();
            renderHand();
            break;

        case 'contention_result':
            handleContentionResult(data);
            break;

        case 'coerce_choose': {
            // I'm the target — must choose a card to give
            const typeNames = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };
            addLog(`${getName(data.coercer_id)} 威逼你交出${typeNames[data.card_type] || ''}牌`);
            update('ui.targetMode', 'coerce_give');
            update('ui.pendingExtra', {
                coercerId: data.coercer_id,
                cardType: data.card_type,
                matchingIds: data.matching_ids,
            });
            renderStage();
            renderHand();
            break;
        }

        case 'coerce_waiting':
            addLog(`等待 ${getName(data.target_id)} 回应威逼...`);
            break;

        case 'coerce_pending':
            addLog(`${getName(data.coercer_id)} 正在威逼 ${getName(data.target_id)}`);
            break;

        case 'intel_received': {
            // Card leaves table zone → enters player's intel zone
            intel.add(data.player_id, data.card);
            update('game.intel', { active: false, sender: null, direction: null, facing: null, target: null, isLocked: false, lockTarget: null, acceptedBy: null });
            addLog(`${getName(data.player_id)} 接收了 ${colorName(data.card.intel_color)} 情报`);
            removeIntelCard();
            animateIntelReveal(data.card.intel_color, data.player_id, () => {
                renderAll();
            });
            break;
        }

        case 'dying':
            update('game.dying', { active: true, player: data.player_id, askingPlayer: null });
            addLog(`${getName(data.player_id)} 濒死！`);
            renderStage();
            break;

        case 'rescue_ask':
            update('game.dying.askingPlayer', data.player_id);
            renderStage();
            renderHand();
            break;

        case 'player_saved':
            addLog(`${getName(data.savior_id)} 用澄清救了 ${getName(data.player_id)}`);
            // Intel leaves player's intel zone (clarify destroys it)
            if (data.removed_intel?.id) {
                intel.removeById(data.player_id, data.removed_intel.id);
            } else {
                intel.remove(data.player_id, data.removed_intel?.intel_color || 'black');
            }
            renderAll();
            break;

        case 'player_died':
            players.kill(data.player_id);
            addLog(`${getName(data.player_id)} 死亡`);
            renderAll();
            break;

        case 'player_eliminated':
            players.kill(data.player_id);
            addLog(`${getName(data.player_id)} 因无牌传递被淘汰`);
            renderAll();
            break;

        case 'death_gift_prompt':
            update('ui.targetMode', 'gift');
            update('ui.giftCards', []);
            update('ui.giftRecipient', null);
            renderGiftUI(data);
            break;

        case 'death_gift_received':
            if (data.cards) {
                hand.add(...data.cards);
                addLog(`你收到了 ${getName(data.from_player)} 的${data.cards.length}张遗赠`);
                renderHand();
            }
            break;

        case 'death_gift_given':
            addLog(`${getName(data.from_player)} 赠送了${data.count}张牌给 ${getName(data.to_player)}`);
            break;

        case 'game_over':
            handleGameOver(data);
            break;

        case 'game_state_sync':
            handleStateSync(data);
            break;

        case 'player_disconnected':
            addLog(`${getName(data.player_id)} 断线`);
            break;

        case 'error':
            showToast(data.message, 2000);
            break;
    }
}

// ── Action Effects ─────────────────────────────────────────

function handleActionEffect(data) {
    const typeNames = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };
    switch (data.effect) {
        case 'probe':
            addLog(`你查看了 ${getName(data.target_id)} 的身份: ${IDENTITY_NAMES[data.identity]}`);
            showProbeResult(data.target_id, data.identity);
            break;
        case 'coerce_gave':
            if (data.card) {
                // I'm the coercer — card arrives in my hand
                addLog(`${getName(data.target_id)} 交出了一张${typeNames[data.card_type] || ''}牌`);
                hand.add(data.card);
                renderHand();
            } else {
                // Observer view
                addLog(`${getName(data.target_id)} 被威逼，交出了一张${typeNames[data.card_type] || ''}牌`);
            }
            break;
        case 'coerce_lost': {
            // I'm the target — card leaves my hand
            addLog(`你被 ${getName(data.coercer_id)} 威逼，交出了一张${typeNames[data.card_type] || ''}牌`);
            hand.take(data.card.id);
            update('ui.targetMode', null);
            update('ui.pendingExtra', null);
            renderHand();
            break;
        }
        case 'coerce_reveal': {
            // I'm the coercer — target has no matching cards, see their hand
            addLog(`${getName(data.target_id)} 没有符合要求的牌，展示手牌`);
            showHandReveal(data.target_id, data.hand);
            break;
        }
        case 'coerce_revealed': {
            // I'm the target — my hand was revealed
            addLog(`你没有${typeNames[data.card_type] || ''}牌，手牌被展示给 ${getName(data.coercer_id)}`);
            break;
        }
        case 'coerce_no_match': {
            // Observer view
            addLog(`${getName(data.target_id)} 没有${typeNames[data.card_type] || ''}牌，手牌被展示`);
            break;
        }
        case 'clarify': {
            const color = colorName(data.removed_intel?.intel_color || 'black');
            addLog(`${getName(data.player_id)} 对 ${getName(data.target_id)} 使用了澄清，移除${color}情报`);
            if (data.removed_intel?.id) {
                intel.removeById(data.target_id, data.removed_intel.id);
            } else {
                intel.remove(data.target_id, data.removed_intel?.intel_color || 'black');
            }
            renderAll();
            break;
        }
    }
}

// ── Contention Results ─────────────────────────────────────

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
            }, 'straight');
            break;
        }
        case 'switch': {
            // Clear pending state
            update('game.contention.pendingEffect', null);
            update('game.contention.pendingPlayer', null);
            update('game.contention.revealedIntel', null);
            update('game.contention.timerPaused', false);
            update('ui.targetMode', null);
            if (data.new_hand_card) {
                // I did the switch — the swap card leaves my hand,
                // old intel comes back as new_hand_card
                const swapCardId = getState().ui.switchedCardId;
                if (swapCardId) {
                    hand.take(swapCardId);
                    update('ui.switchedCardId', null);
                }
                hand.add(data.new_hand_card);
                addLog(`你调包了情报`);
            } else {
                addLog(`${getName(data.player_id)} 调包了情报`);
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
            }, data.direction);
            break;
        }
    }
}

// ── State Sync (reconnect) ─────────────────────────────────

function handleStateSync(data) {
    mergeGame({
        started: true,
        myIdentity: data.your_identity,
        myHand: data.your_hand,
        myIntel: data.your_intel,
        phase: data.phase,
        currentPlayer: data.current_player,
        turnOrder: data.turn_order,
        playerNames: data.player_names,
    });

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
            revealedIntel: null,
        });
        // If pending choice is mine, set target mode
        if (data.contention_pending === 'decoy_direction' && data.contention_pending_player === getState().myId) {
            update('ui.targetMode', 'decoy_direction');
        } else if (data.contention_pending === 'switch_card' && data.contention_pending_player === getState().myId) {
            update('ui.targetMode', 'switch_pick');
        }
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

// ── UI Helpers ─────────────────────────────────────────────

function showHandReveal(targetId, cards) {
    const div = document.createElement('div');
    div.className = 'hand-reveal';
    const name = getName(targetId);
    div.innerHTML = `
        <div class="hand-reveal-title">${name} 的手牌</div>
        <div class="hand-reveal-cards">
            ${cards.map(c => `<div class="hand-reveal-card card-${c.intel_color}">
                <span class="hand-reveal-card-name">${c.action_name}</span>
                <span class="hand-reveal-card-icon">${c.icon}</span>
            </div>`).join('')}
        </div>
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

function showProbeResult(targetId, identity) {
    const div = document.createElement('div');
    div.className = 'probe-result';
    const name = getName(targetId);
    const idName = IDENTITY_NAMES[identity];
    const color = identity === 'resistance' ? 'var(--color-red)' : 'var(--color-blue)';
    div.innerHTML = `
        <div>${name} 的身份</div>
        <div class="identity-reveal" style="color:${color}">${idName}</div>
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

let toastTimer = null;
export function showToast(msg, duration = 2000) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.style.cssText = `
            position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
            background:var(--color-glass);
            backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            border:1px solid var(--color-border);
            padding:8px 16px;border-radius:6px;font-size:13px;z-index:99;
            color:var(--color-text);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.style.display = 'none', duration);
}

function handleGameOver(data) {
    const overlay = document.getElementById('game-over-overlay');
    const content = document.getElementById('game-over-content');

    const factionName = IDENTITY_NAMES[data.winning_faction] || data.winning_faction;
    const factionColor = data.winning_faction === 'resistance' ? 'var(--color-red)' : 'var(--color-blue)';

    const st = getState();
    const isWinner = data.winners.includes(st.myId);

    let identitiesHtml = '';
    for (const [pid, identity] of Object.entries(data.identities)) {
        const name = st.game.playerNames[pid] || pid;
        const iName = IDENTITY_NAMES[identity];
        const won = data.winners.includes(pid);
        identitiesHtml += `<div>${name}: ${iName} ${won ? '\u2713' : ''}</div>`;
    }

    content.innerHTML = `
        <h2 style="color:${factionColor}">${isWinner ? '胜利！' : '失败...'}</h2>
        <div class="winner-faction">${factionName} 获胜</div>
        <div class="identities-list">${identitiesHtml}</div>
    `;

    overlay.classList.remove('hidden');
}

function renderGiftUI(data) {
    document.querySelector('.gift-ui')?.remove();

    const st = getState();
    const g = st.game;
    const alivePlayers = g.turnOrder.filter(pid =>
        pid !== st.myId && g.players[pid]?.alive
    );

    const div = document.createElement('div');
    div.className = 'gift-ui';
    div.innerHTML = `
        <p>选择最多3张牌赠送给一名玩家（或跳过）</p>
        <div class="gift-player-select">
            ${alivePlayers.map(pid =>
                `<button class="gift-player-btn" data-pid="${pid}">${g.playerNames[pid]}</button>`
            ).join('')}
        </div>
        <div style="margin-bottom:8px;">
            <button class="btn btn-accent btn-sm" id="btn-gift-confirm">赠送</button>
            <button class="btn btn-secondary btn-sm" id="btn-gift-skip">跳过</button>
        </div>
    `;
    document.body.appendChild(div);
}
