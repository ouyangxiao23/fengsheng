/**
 * Game screen rendering + server message handling.
 * Three zones: Table (avatars), Stage (phase + intel), Cockpit (hand).
 */

import { getState, update, mergeGame, addLog } from './state.js';
import { renderLobby } from './lobby.js';

const IDENTITY_NAMES = {
    resistance: '潜伏战线',
    agency: '特工机关',
};
const IDENTITY_COLORS = {
    resistance: 'var(--color-red)',
    agency: 'var(--color-blue)',
};
const PHASE_ORDER = ['draw', 'action', 'transmission', 'contention', 'reception'];

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

        case 'intel_transmitted':
            update('game.intel', {
                active: true,
                sender: data.sender_id,
                direction: data.direction,
                facing: data.facing,
                isLocked: data.is_locked,
                lockTarget: data.lock_target,
                acceptedBy: null,
            });
            addLog(`${getName(data.sender_id)} 传出了情报 → ${data.direction === 'left' ? '←左' : '→右'}`);
            renderStage();
            renderTable();
            break;

        case 'intel_moved':
            update('game.intel.facing', data.to_player);
            addLog(`情报传到 ${getName(data.to_player)} 面前`);
            renderStage();
            renderTable();
            break;

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
            if (p) p.intelArea.push({ intel_color: data.card.intel_color });
            if (data.player_id === getState().myId) {
                const myIntel = getState().game.myIntel;
                update('game.myIntel', [...myIntel, { intel_color: data.card.intel_color }]);
            }
            update('game.intel', { active: false, sender: null, direction: null, facing: null, isLocked: false, lockTarget: null, acceptedBy: null });
            addLog(`${getName(data.player_id)} 接收了 ${colorName(data.card.intel_color)} 情报`);
            renderAll();
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
            // Update intel area — remove the black
            if (data.player_id === getState().myId) {
                const mi = getState().game.myIntel;
                const idx = mi.findIndex(c => c.intel_color === 'black');
                if (idx >= 0) mi.splice(idx, 1);
                update('game.myIntel', [...mi]);
            }
            {
                const p = getState().game.players[data.player_id];
                if (p) {
                    const idx = p.intelArea.findIndex(c => c.intel_color === 'black');
                    if (idx >= 0) p.intelArea.splice(idx, 1);
                }
            }
            renderAll();
            break;

        case 'player_died':
            getState().game.players[data.player_id].alive = false;
            addLog(`${getName(data.player_id)} 死亡`);
            renderAll();
            break;

        case 'player_eliminated':
            getState().game.players[data.player_id].alive = false;
            addLog(`${getName(data.player_id)} 因无牌传递被淘汰`);
            renderAll();
            break;

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
        case 'coerce_lost':
            addLog(`你被 ${getName(data.coercer_id)} 威逼，失去一张牌`);
            const hand = getState().game.myHand.filter(c => c.id !== data.card.id);
            update('game.myHand', hand);
            renderHand();
            break;
        case 'clarify':
            addLog(`${getName(data.player_id)} 对 ${getName(data.target_id)} 使用了澄清`);
            {
                const p = getState().game.players[data.target_id];
                if (p) {
                    const idx = p.intelArea.findIndex(c => c.intel_color === 'black');
                    if (idx >= 0) p.intelArea.splice(idx, 1);
                }
            }
            if (data.target_id === getState().myId) {
                const mi = getState().game.myIntel;
                const idx = mi.findIndex(c => c.intel_color === 'black');
                if (idx >= 0) mi.splice(idx, 1);
                update('game.myIntel', [...mi]);
            }
            renderAll();
            break;
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

// ── Rendering Functions ────────────────────────────────────

export function renderAll() {
    renderStatusBar();
    renderTable();
    renderStage();
    renderMyIntel();
    renderHand();
}

function renderStatusBar() {
    const st = getState();
    const roomLabel = document.getElementById('room-label');
    const idLabel = document.getElementById('identity-label');

    roomLabel.textContent = `房间: ${st.roomId || ''}`;

    if (st.game.myIdentity) {
        idLabel.textContent = IDENTITY_NAMES[st.game.myIdentity];
        idLabel.className = `identity-${st.game.myIdentity}`;
    }
}

export function renderTable() {
    const st = getState();
    const g = st.game;
    const area = document.getElementById('table-area');

    // Get other players in seating order (exclude self)
    const otherIds = g.turnOrder.filter(id => id !== st.myId);
    const n = otherIds.length;
    if (n === 0) return;

    const w = area.clientWidth || 360;
    const h = area.clientHeight || 200;
    const cx = w / 2;
    const cy = h * 0.9;
    const rx = w * 0.42;
    const ry = h * 0.7;

    // Place avatars on semi-ellipse arc (pi to 0 for top semi-circle)
    area.innerHTML = '';

    for (let i = 0; i < n; i++) {
        const pid = otherIds[i];
        const p = g.players[pid];
        if (!p) continue;

        const angle = Math.PI - (Math.PI * (i + 1) / (n + 1));
        const x = cx + rx * Math.cos(angle);
        const y = cy - ry * Math.sin(angle);

        const wrap = document.createElement('div');
        wrap.className = 'avatar-wrap';
        wrap.style.left = x + 'px';
        wrap.style.top = y + 'px';
        wrap.dataset.playerId = pid;

        const isActive = pid === g.currentPlayer;
        const isFacing = g.intel.active && pid === g.intel.facing;
        const isDead = !p.alive;

        let avatarCls = 'avatar';
        if (isActive) avatarCls += ' avatar-active';
        if (isFacing) avatarCls += ' avatar-facing';
        if (isDead) avatarCls += ' avatar-dead';

        const name = g.playerNames[pid] || pid;
        const initial = name.charAt(0);

        wrap.innerHTML = `
            <div class="${avatarCls}">
                ${initial}
                <span class="avatar-hand-count">${p.handCount}</span>
            </div>
            <div class="avatar-name">${name}</div>
            <div class="avatar-intel">
                ${p.intelArea.map(c => `<span class="intel-pip intel-pip-${c.intel_color}"></span>`).join('')}
            </div>
        `;

        area.appendChild(wrap);
    }
}

export function renderStage() {
    const st = getState();
    const g = st.game;
    const myId = st.myId;

    // Phase bar
    const dots = document.querySelectorAll('.phase-dot');
    const activeIdx = PHASE_ORDER.indexOf(g.phase);
    dots.forEach((dot, i) => {
        dot.classList.remove('phase-active', 'phase-done');
        if (i === activeIdx) dot.classList.add('phase-active');
        else if (i < activeIdx) dot.classList.add('phase-done');
    });

    const prompt = document.getElementById('stage-prompt');
    const btns = document.getElementById('stage-buttons');
    const intelSlot = document.getElementById('intel-card-slot');

    prompt.textContent = '';
    btns.innerHTML = '';
    intelSlot.innerHTML = '';

    const isMyTurn = g.currentPlayer === myId;

    // Phase-specific rendering
    switch (g.phase) {
        case 'draw':
            prompt.textContent = isMyTurn ? '正在摸牌...' : `${getName(g.currentPlayer)} 摸牌中`;
            break;

        case 'action':
            if (isMyTurn) {
                prompt.textContent = '出牌阶段 — 选择手牌使用或点击完成';
                btns.innerHTML = `<button class="btn btn-accent btn-sm" id="btn-action-done">完成出牌</button>`;
            } else {
                prompt.textContent = `${getName(g.currentPlayer)} 出牌中...`;
            }
            break;

        case 'transmission':
            if (g.intel.active) {
                // Intel is traveling
                intelSlot.innerHTML = `<div class="card-back" style="width:48px;height:72px;font-size:16px;border-radius:4px;"></div>`;
                const facingName = getName(g.intel.facing);
                const dir = g.intel.direction === 'left' ? '←左' : '→右';
                prompt.textContent = `情报(${dir})在 ${facingName} 面前`;

                if (g.intel.facing === myId) {
                    const locked = g.intel.isLocked && g.intel.lockTarget === myId;
                    if (locked) {
                        prompt.textContent = '你被锁定，必须接收情报';
                    } else {
                        btns.innerHTML = `
                            <button class="btn btn-accent btn-sm" id="btn-accept">接收</button>
                            <button class="btn btn-secondary btn-sm" id="btn-pass">传递</button>
                        `;
                    }
                }
            } else if (isMyTurn) {
                prompt.textContent = '选择一张手牌作为情报传出';
            } else {
                prompt.textContent = `${getName(g.currentPlayer)} 正在选择情报...`;
            }
            break;

        case 'contention':
            intelSlot.innerHTML = `<div class="card-back" style="width:48px;height:72px;font-size:16px;border-radius:4px;"></div>`;
            const receiverName = getName(g.intel.acceptedBy);
            prompt.textContent = `争夺阶段 — ${receiverName} 将接收情报`;

            if (g.contention.askingPlayer === myId) {
                prompt.textContent = '是否使用争夺牌？';
                btns.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-contention-pass">放弃</button>`;
            } else if (g.contention.askingPlayer) {
                prompt.textContent += ` (${getName(g.contention.askingPlayer)} 决定中)`;
            }
            break;

        case 'reception':
            prompt.textContent = '接收阶段';
            break;

        case 'dying': {
            const dyingName = getName(g.dying.player);
            prompt.textContent = `${dyingName} 濒死！`;

            if (g.dying.askingPlayer === myId) {
                const hasClarify = g.myHand.some(c => c.action_effect === 'clarify');
                prompt.textContent = `${dyingName} 濒死！是否使用澄清？`;
                if (hasClarify) {
                    btns.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-rescue-pass">放弃</button>`;
                    // Card selection handled by hand tap
                } else {
                    btns.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-rescue-pass">放弃</button>`;
                }
            } else if (g.dying.askingPlayer) {
                prompt.textContent += ` (${getName(g.dying.askingPlayer)} 决定中)`;
            }
            break;
        }

        case 'death_gift':
            prompt.textContent = '遗赠阶段';
            break;

        case 'game_over':
            prompt.textContent = '游戏结束';
            break;
    }
}

function renderMyIntel() {
    const st = getState();
    const bar = document.getElementById('my-intel-bar');
    const intel = st.game.myIntel;

    let html = '<span class="my-intel-label">我的情报:</span>';
    if (intel.length === 0) {
        html += '<span style="color:var(--color-muted);font-size:10px;">无</span>';
    } else {
        for (const c of intel) {
            html += `<span class="my-intel-pip my-intel-pip-${c.intel_color}"></span>`;
        }
    }
    bar.innerHTML = html;
}

export function renderHand() {
    const st = getState();
    const g = st.game;
    const container = document.getElementById('my-hand');
    const cards = g.myHand;

    container.innerHTML = '';
    if (cards.length === 0) {
        container.innerHTML = '<span class="hand-empty">无手牌</span>';
        return;
    }

    const containerW = container.clientWidth || 340;
    const cardW = 72;
    const maxOverlap = 50;
    const totalNeed = cardW + (cards.length - 1) * maxOverlap;
    const overlap = totalNeed > containerW
        ? Math.max(20, (containerW - cardW) / Math.max(cards.length - 1, 1))
        : maxOverlap;
    const totalWidth = cardW + (cards.length - 1) * overlap;
    const startX = (containerW - totalWidth) / 2;

    // Determine playable state
    const isMyTurn = g.currentPlayer === st.myId;

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const wrap = document.createElement('div');
        wrap.className = 'hand-card-wrap';
        wrap.style.left = (startX + i * overlap) + 'px';
        wrap.style.zIndex = i + 1;
        wrap.dataset.cardId = card.id;

        if (st.ui.selectedCardId === card.id) {
            wrap.classList.add('card-selected-wrap');
        }

        const playable = isCardPlayable(card, g, st);
        const cardEl = createCardElement(card, !playable);
        wrap.appendChild(cardEl);
        container.appendChild(wrap);
    }
}

function isCardPlayable(card, game, st) {
    const isMyTurn = game.currentPlayer === st.myId;

    if (game.phase === 'action' && isMyTurn && card.action_phase === 'action') return true;
    if (game.phase === 'transmission' && isMyTurn && !game.intel.active) return true;
    if (game.phase === 'contention' && game.contention.askingPlayer === st.myId
        && card.action_phase === 'contention') return true;
    if (game.phase === 'dying' && game.dying.askingPlayer === st.myId
        && card.action_effect === 'clarify') return true;

    return false;
}

export function createCardElement(card, dimmed = false) {
    const el = document.createElement('div');
    el.className = `card card-${card.intel_color}`;
    if (dimmed) el.classList.add('card-dimmed');

    const pipCls = `pip-${card.intel_color}`;
    const phaseText = card.action_phase === 'action' ? '出牌' : '争夺';
    const dirSymbol = card.direction === 'left' ? '↙' : card.direction === 'right' ? '↘' : '↕';

    let attrsHtml = `<span>${dirSymbol}</span>`;
    if (card.has_lock) attrsHtml += '<span>🔒</span>';
    if (card.has_hidden) attrsHtml += '<span>🙈</span>';

    el.innerHTML = `
        <div class="card-corner card-corner-tl"><span class="${pipCls}">●</span></div>
        <div class="card-banner">${card.action_name}</div>
        <div class="card-icon">${card.icon}</div>
        <div class="card-footer">
            <span class="card-phase-tag">${phaseText}</span>
            <span class="card-attrs">${attrsHtml}</span>
        </div>
        <div class="card-corner card-corner-br"><span class="${pipCls}">●</span></div>
    `;
    return el;
}

// ── UI Helpers ─────────────────────────────────────────────

function getName(pid) {
    if (!pid) return '???';
    const st = getState();
    if (pid === st.myId) return '你';
    return st.game.playerNames[pid] || pid;
}

function colorName(c) {
    return c === 'red' ? '红色' : c === 'blue' ? '蓝色' : '黑色';
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
function showToast(msg, duration = 2000) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.style.cssText = `
            position:fixed;top:60px;left:50%;transform:translateX(-50%);
            background:var(--color-surface);border:1px solid var(--color-border);
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
        identitiesHtml += `<div>${name}: ${iName} ${won ? '✓' : ''}</div>`;
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
