/**
 * Server message dispatch and game state mutations.
 */

import { getState, update, mergeGame, addLog } from './state.js';
import { IDENTITY_NAMES, IDENTITY_COLORS, getName, colorName } from './constants.js';
import { renderLobby } from './lobby.js';
import { renderAll, renderHand, renderStage, renderTable } from './render.js';
import { removeIntelCard, animateIntelAlongArc, animateIntelReveal } from './animations.js';

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

        case 'game_start':
            mergeGame({
                started: true,
                myIdentity: data.your_identity,
                turnOrder: data.turn_order,
                playerNames: data.player_names,
            });
            // Init players map
            const players = {};
            for (const pid of data.turn_order) {
                players[pid] = { handCount: 0, intelArea: [], alive: true };
            }
            update('game.players', players);
            document.body.className = 'screen-game';
            renderAll();
            addLog(`游戏开始！你的身份：${IDENTITY_NAMES[data.your_identity]}`);
            break;

        case 'deal_hand':
            update('game.myHand', data.cards);
            renderHand();
            break;

        case 'phase_change':
            mergeGame({ phase: data.phase, currentPlayer: data.current_player });
            update('game.intel.active', false);
            update('game.contention', { active: false, askingPlayer: null });
            if (data.phase === 'dying') {
                // keep dying state
            } else {
                update('game.dying', { active: false, player: null, askingPlayer: null });
            }
            update('ui.selectedCardId', null);
            update('ui.targetMode', null);
            // Clear the intel card only when a brand-new round starts (draw phase)
            if (data.phase === 'draw') removeIntelCard();
            renderStage();
            renderTable();
            break;

        case 'draw_cards':
            if (data.cards) {
                // My draw
                const hand = getState().game.myHand;
                update('game.myHand', [...hand, ...data.cards]);
                addLog(`你摸了${data.cards.length}张牌`);
                renderHand();
            } else {
                addLog(`${getName(data.player_id)} 摸了${data.count}张牌`);
            }
            break;

        case 'hand_count_update':
            for (const [pid, count] of Object.entries(data.counts)) {
                const p = getState().game.players[pid];
                if (p) p.handCount = count;
            }
            renderTable();
            break;

        case 'card_played': {
            const who = getName(data.player_id);
            if (data.card) {
                addLog(`${who} 使用了 ${data.card.action_name}`);
            } else {
                addLog(`${who} 使用了 ${data.action_name || '一张牌'}（暗置）`);
            }
            // Remove from my hand if I played it
            if (data.player_id === getState().myId && data.card) {
                const hand = getState().game.myHand.filter(c => c.id !== data.card.id);
                update('game.myHand', hand);
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
                isLocked: data.is_locked,
                lockTarget: data.lock_target,
                acceptedBy: null,
            });
            addLog(`${getName(senderId)} 传出了情报 → ${data.direction === 'left' ? '←左' : '→右'}`);
            // Animate intel from sender to facing along the ellipse arc
            animateIntelAlongArc(senderId, facingId, () => {
                renderStage();
                renderTable();
            });
            break;
        }

        case 'intel_moved': {
            const oldFacing = getState().game.intel.facing;
            const newFacing = data.to_player;
            update('game.intel.facing', newFacing);
            addLog(`情报传到 ${getName(newFacing)} 面前`);
            animateIntelAlongArc(oldFacing, newFacing, () => {
                renderStage();
                renderTable();
            });
            break;
        }

        case 'intel_accepted':
            update('game.intel.acceptedBy', data.player_id);
            addLog(`${getName(data.player_id)} 宣布接收情报`);
            renderStage();
            break;

        case 'contention_ask':
            update('game.contention', { active: true, askingPlayer: data.player_id });
            renderStage();
            renderHand();
            break;

        case 'contention_result':
            handleContentionResult(data);
            break;

        case 'burn_peek':
            addLog(`你偷看了情报：${colorName(data.card.intel_color)}`);
            showToast(`情报颜色: ${colorName(data.card.intel_color)}`, 3000);
            break;

        case 'intel_received': {
            const p = getState().game.players[data.player_id];
            if (p) {
                const newArea = [...p.intelArea, { intel_color: data.card.intel_color }];
                p.intelArea = newArea;
            }
            if (data.player_id === getState().myId) {
                const myIntel = getState().game.myIntel;
                update('game.myIntel', [...myIntel, { intel_color: data.card.intel_color }]);
            }
            update('game.intel', { active: false, sender: null, direction: null, facing: null, isLocked: false, lockTarget: null, acceptedBy: null });
            addLog(`${getName(data.player_id)} 接收了 ${colorName(data.card.intel_color)} 情报`);
            // Remove the table intel card, then animate reveal
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
            // Bug fix #3: copy array before splice
            if (data.player_id === getState().myId) {
                const mi = [...getState().game.myIntel];
                const idx = mi.findIndex(c => c.intel_color === 'black');
                if (idx >= 0) mi.splice(idx, 1);
                update('game.myIntel', mi);
            }
            {
                const p = getState().game.players[data.player_id];
                if (p) {
                    const area = [...p.intelArea];
                    const idx = area.findIndex(c => c.intel_color === 'black');
                    if (idx >= 0) area.splice(idx, 1);
                    p.intelArea = area;
                }
            }
            renderAll();
            break;

        case 'player_died': {
            // Bug fix #2: notify after mutation
            const deadPlayers = getState().game.players;
            deadPlayers[data.player_id].alive = false;
            update('game.players', deadPlayers);
            addLog(`${getName(data.player_id)} 死亡`);
            renderAll();
            break;
        }

        case 'player_eliminated': {
            // Bug fix #2: notify after mutation
            const elimPlayers = getState().game.players;
            elimPlayers[data.player_id].alive = false;
            update('game.players', elimPlayers);
            addLog(`${getName(data.player_id)} 因无牌传递被淘汰`);
            renderAll();
            break;
        }

        case 'death_gift_prompt':
            // Show gift UI for dying player
            update('ui.targetMode', 'gift');
            update('ui.giftCards', []);
            update('ui.giftRecipient', null);
            renderGiftUI(data);
            break;

        case 'death_gift_received':
            if (data.cards) {
                const hand = getState().game.myHand;
                update('game.myHand', [...hand, ...data.cards]);
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
    switch (data.effect) {
        case 'probe':
            addLog(`你查看了 ${getName(data.target_id)} 的身份: ${IDENTITY_NAMES[data.identity]}`);
            showProbeResult(data.target_id, data.identity);
            break;
        case 'coerce':
            if (data.card) {
                addLog(`${getName(data.target_id)} 被威逼，你得到一张牌`);
                const hand = getState().game.myHand;
                update('game.myHand', [...hand, data.card]);
                renderHand();
            } else if (data.result === 'no_cards') {
                addLog(`${getName(data.target_id)} 没有手牌`);
            } else {
                addLog(`${getName(data.target_id)} 被威逼`);
            }
            break;
        case 'coerce_lost': {
            addLog(`你被 ${getName(data.coercer_id)} 威逼，失去一张牌`);
            const hand = getState().game.myHand.filter(c => c.id !== data.card.id);
            update('game.myHand', hand);
            renderHand();
            break;
        }
        case 'clarify': {
            addLog(`${getName(data.player_id)} 对 ${getName(data.target_id)} 使用了澄清`);
            // Bug fix #3: copy array before splice
            const p = getState().game.players[data.target_id];
            if (p) {
                const area = [...p.intelArea];
                const idx = area.findIndex(c => c.intel_color === 'black');
                if (idx >= 0) area.splice(idx, 1);
                p.intelArea = area;
            }
            if (data.target_id === getState().myId) {
                const mi = [...getState().game.myIntel];
                const idx = mi.findIndex(c => c.intel_color === 'black');
                if (idx >= 0) mi.splice(idx, 1);
                update('game.myIntel', mi);
            }
            renderAll();
            break;
        }
        case 'secret_order':
            if (data.cards) {
                const h = getState().game.myHand;
                update('game.myHand', [...h, ...data.cards]);
                addLog(`密令：你摸了1张牌`);
                renderHand();
            } else {
                addLog(`${getName(data.player_id)} 使用了密令`);
            }
            break;
    }
}

// ── Contention Results ─────────────────────────────────────

function handleContentionResult(data) {
    switch (data.effect) {
        case 'intercept':
            addLog(`${getName(data.player_id)} 截获了情报！`);
            update('game.intel.acceptedBy', data.player_id);
            renderStage();
            break;
        case 'switch':
            if (data.new_hand_card) {
                // I did the switch — got old intel back
                const hand = getState().game.myHand;
                update('game.myHand', [...hand, data.new_hand_card]);
                addLog(`你调包了情报`);
                renderHand();
            } else {
                addLog(`${getName(data.player_id)} 调包了情报`);
            }
            break;
        case 'decoy':
            update('game.intel.direction', data.new_direction);
            addLog(`${getName(data.player_id)} 使用误导，方向变为 ${data.new_direction === 'left' ? '←左' : '→右'}`);
            renderStage();
            break;
        case 'burn_success':
            addLog(`${getName(data.player_id)} 烧毁了 ${colorName(data.intel_color)} 情报！`);
            update('game.intel.active', false);
            removeIntelCard();
            renderAll();
            break;
        case 'burn_fail':
            addLog(`${getName(data.player_id)} 烧毁失败`);
            break;
        case 'return':
            update('game.intel.acceptedBy', data.receiver);
            addLog(`${getName(data.player_id)} 将情报退回给 ${getName(data.receiver)}`);
            renderStage();
            break;
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

    const players = {};
    for (const [pid, p] of Object.entries(data.players)) {
        players[pid] = {
            handCount: p.hand_count,
            intelArea: p.intel_area,
            alive: p.alive,
        };
    }
    update('game.players', players);

    if (data.intel) {
        update('game.intel', {
            active: data.intel.active,
            sender: data.intel.sender,
            direction: data.intel.direction,
            facing: data.intel.facing,
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

    if (data.contention_asking) {
        update('game.contention', { active: true, askingPlayer: data.contention_asking });
    }

    document.body.className = 'screen-game';
    renderAll();
}

// ── UI Helpers ─────────────────────────────────────────────

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
    // Remove existing gift UI
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
