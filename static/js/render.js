/**
 * Pure DOM rendering — Table (avatars), Stage (phase + intel), Cockpit (hand).
 */

import { getState, update } from './state.js';
import { IDENTITY_NAMES, IDENTITY_COLORS, PHASE_ORDER, getName } from './constants.js';
import { ensureIntelCard, removeIntelCard, intelRestPosition, setAvatarPositions, setTableEllipse, getAvatarPositions } from './animations.js';

// Track which card IDs have already been rendered (for entrance animation)
const seenHandCardIds = new Set();

// ── Shared State Reset ──────────────────────────────────────

export function resetHandAnimationState() {
    seenHandCardIds.clear();
}

// ── Avatar Helpers ──────────────────────────────────────────

export function getAvatarPagePosition(pid) {
    const pos = getAvatarPositions()[pid];
    if (!pos) return null;
    const area = document.getElementById('table-area');
    if (!area) return null;
    const rect = area.getBoundingClientRect();
    return { x: rect.left + pos.x, y: rect.top + pos.y };
}

export function getSelfPosition() {
    const hand = document.getElementById('my-hand');
    if (!hand) return null;
    const rect = hand.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 20 };
}

// ── Rendering Functions ────────────────────────────────────

export function renderAll() {
    renderRibbon();
    renderTable();
    renderStage();
    renderMyIntel();
    renderHand();
}

function renderRibbon() {
    const st = getState();
    const roomLabel = document.getElementById('room-label');
    const idLabel = document.getElementById('identity-label');
    const strip = document.querySelector('.ribbon-faction-strip');

    if (roomLabel) roomLabel.textContent = `房间: ${st.roomId || ''}`;

    if (st.game.myIdentity && idLabel) {
        idLabel.textContent = IDENTITY_NAMES[st.game.myIdentity];
        idLabel.className = `identity-${st.game.myIdentity}`;
    }

    if (strip && st.game.myIdentity) {
        strip.style.background = IDENTITY_COLORS[st.game.myIdentity] || 'var(--color-muted)';
    }
}

export function renderTable() {
    const st = getState();
    const g = st.game;
    const area = document.getElementById('table-area');

    const allIds = g.turnOrder;  // all players including self
    const N = allIds.length;
    if (N === 0) return;

    const w = area.clientWidth || 360;
    const h = area.clientHeight || 200;
    const cx = w / 2;
    const cy = h * 0.50;   // centre of area so full ellipse is visible
    const rx = w * 0.42;
    const ry = h * 0.44;

    // Cache ellipse params in animations module
    setTableEllipse({ cx, cy, rx, ry });

    area.innerHTML = '';

    // Self is pinned to angle = -π/2 (bottom of ellipse).
    // All players are spread evenly from that anchor around the full circle.
    const selfIdx = allIds.indexOf(st.myId);
    function playerAngle(i) {
        const offset = (i - selfIdx + N) % N;   // 0 = self, 1 = next in turn order, …
        return -Math.PI / 2 + (2 * Math.PI * offset / N);
    }

    // ── Draw table surface: two separate half-ellipses (upper + lower) ──
    const svgNS = 'http://www.w3.org/2000/svg';
    const tableSvg = document.createElementNS(svgNS, 'svg');
    tableSvg.setAttribute('width', String(w));
    tableSvg.setAttribute('height', String(h));
    tableSvg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;';

    const defs = document.createElementNS(svgNS, 'defs');

    // Upper dome gradient: top (apex) → baseline
    const gradUp = document.createElementNS(svgNS, 'linearGradient');
    gradUp.setAttribute('id', 'tbl-grad-up');
    gradUp.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradUp.setAttribute('x1', '0'); gradUp.setAttribute('y1', String(cy - ry));
    gradUp.setAttribute('x2', '0'); gradUp.setAttribute('y2', String(cy));
    const u1 = document.createElementNS(svgNS, 'stop');
    u1.setAttribute('offset', '0%');   u1.setAttribute('stop-color', 'rgba(120,190,230,0.30)');
    const u2 = document.createElementNS(svgNS, 'stop');
    u2.setAttribute('offset', '100%'); u2.setAttribute('stop-color', 'rgba(120,190,230,0.12)');
    gradUp.appendChild(u1); gradUp.appendChild(u2);
    defs.appendChild(gradUp);

    // Lower dome gradient: baseline → bottom (nadir)
    const gradDown = document.createElementNS(svgNS, 'linearGradient');
    gradDown.setAttribute('id', 'tbl-grad-down');
    gradDown.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradDown.setAttribute('x1', '0'); gradDown.setAttribute('y1', String(cy));
    gradDown.setAttribute('x2', '0'); gradDown.setAttribute('y2', String(cy + ry));
    const d1 = document.createElementNS(svgNS, 'stop');
    d1.setAttribute('offset', '0%');   d1.setAttribute('stop-color', 'rgba(120,190,230,0.12)');
    const d2 = document.createElementNS(svgNS, 'stop');
    d2.setAttribute('offset', '100%'); d2.setAttribute('stop-color', 'rgba(120,190,230,0.25)');
    gradDown.appendChild(d1); gradDown.appendChild(d2);
    defs.appendChild(gradDown);

    tableSvg.appendChild(defs);

    // ── Upper dome (sweep=1: clockwise on screen = arcs UP) ──
    const upperDome = document.createElementNS(svgNS, 'path');
    upperDome.setAttribute('d',
        `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy} Z`
    );
    upperDome.setAttribute('fill', 'url(#tbl-grad-up)');
    tableSvg.appendChild(upperDome);

    // ── Lower dome (sweep=0: counter-clockwise on screen = arcs DOWN) ──
    const lowerDome = document.createElementNS(svgNS, 'path');
    lowerDome.setAttribute('d',
        `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy} Z`
    );
    lowerDome.setAttribute('fill', 'url(#tbl-grad-down)');
    tableSvg.appendChild(lowerDome);

    // Outer stroke — full ellipse (both arcs)
    const upperStroke = document.createElementNS(svgNS, 'path');
    upperStroke.setAttribute('d',
        `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`
    );
    upperStroke.setAttribute('fill', 'none');
    upperStroke.setAttribute('stroke', 'rgba(80, 150, 200, 0.50)');
    upperStroke.setAttribute('stroke-width', '1.5');
    upperStroke.setAttribute('stroke-linecap', 'round');
    tableSvg.appendChild(upperStroke);

    const lowerStroke = document.createElementNS(svgNS, 'path');
    lowerStroke.setAttribute('d',
        `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`
    );
    lowerStroke.setAttribute('fill', 'none');
    lowerStroke.setAttribute('stroke', 'rgba(80, 150, 200, 0.35)');
    lowerStroke.setAttribute('stroke-width', '1.5');
    lowerStroke.setAttribute('stroke-linecap', 'round');
    tableSvg.appendChild(lowerStroke);

    // Inner highlight arcs (glassy rim) — upper and lower
    const innerUpper = document.createElementNS(svgNS, 'path');
    innerUpper.setAttribute('d',
        `M ${cx - rx + 8} ${cy} A ${rx - 8} ${ry - 6} 0 0 1 ${cx + rx - 8} ${cy}`
    );
    innerUpper.setAttribute('fill', 'none');
    innerUpper.setAttribute('stroke', 'rgba(255, 255, 255, 0.45)');
    innerUpper.setAttribute('stroke-width', '1');
    tableSvg.appendChild(innerUpper);

    const innerLower = document.createElementNS(svgNS, 'path');
    innerLower.setAttribute('d',
        `M ${cx - rx + 8} ${cy} A ${rx - 8} ${ry - 6} 0 0 0 ${cx + rx - 8} ${cy}`
    );
    innerLower.setAttribute('fill', 'none');
    innerLower.setAttribute('stroke', 'rgba(255, 255, 255, 0.30)');
    innerLower.setAttribute('stroke-width', '1');
    tableSvg.appendChild(innerLower);

    area.appendChild(tableSvg);

    // Place ALL players (including self) around the full ellipse
    const newPositions = {};
    for (let i = 0; i < N; i++) {
        const pid = allIds[i];
        const isSelf = pid === st.myId;
        const p = isSelf
            ? { handCount: g.myHand.length, intelArea: g.myIntel || [], alive: true }
            : g.players[pid];
        if (!p) continue;

        const angle = playerAngle(i);
        const x = cx + rx * Math.cos(angle);
        const y = cy - ry * Math.sin(angle);

        newPositions[pid] = { x, y, angle };

        const wrap = document.createElement('div');
        wrap.className = 'avatar-wrap';
        wrap.style.left = x + 'px';
        wrap.style.top  = y + 'px';
        if (!isSelf) wrap.dataset.playerId = pid;

        const isActive = pid === g.currentPlayer;
        const isFacing = g.intel.active && pid === g.intel.facing;
        const isDead   = !p.alive;

        let avatarCls = 'avatar';
        if (isSelf)   avatarCls += ' avatar-me';
        if (isActive) avatarCls += ' avatar-active';
        if (isFacing) avatarCls += ' avatar-facing';
        if (isDead)   avatarCls += ' avatar-dead';

        const name    = isSelf ? (g.playerNames[pid] || '我') : (g.playerNames[pid] || pid);
        const initial = name.charAt(0);

        wrap.innerHTML = `
            <div class="${avatarCls}">
                ${initial}
                <span class="avatar-hand-count">${p.handCount}</span>
            </div>
            <div class="avatar-name">${isSelf ? name + '（我）' : name}</div>
            <div class="avatar-intel">
                ${p.intelArea.map(c => `<span class="intel-pip intel-pip-${c.intel_color}"></span>`).join('')}
            </div>
        `;

        area.appendChild(wrap);
    }

    // Commit avatar positions to animations module
    setAvatarPositions(newPositions);

    // If intel is active, ensure the persistent card is placed at the facing player.
    // This handles state-sync / reconnect scenarios where animation wasn't played.
    if (g.intel.active && g.intel.facing) {
        const rp = intelRestPosition(g.intel.facing);
        if (rp) {
            const card = ensureIntelCard();
            if (card) card.style.transform = `translate(${rp.lx - 24}px, ${rp.ly - 36}px)`;
        }
    }
}

export function renderStage() {
    const st = getState();
    const g = st.game;
    const myId = st.myId;

    // Phase bar — use phase-node
    const nodes = document.querySelectorAll('.phase-node');
    const activeIdx = PHASE_ORDER.indexOf(g.phase);
    nodes.forEach((node, i) => {
        node.classList.remove('phase-active', 'phase-done');
        if (i === activeIdx) node.classList.add('phase-active');
        else if (i < activeIdx) node.classList.add('phase-done');
    });

    // Phase progress line
    const phaseLine = document.querySelector('.phase-line');
    if (phaseLine && nodes.length > 0) {
        const progress = activeIdx >= 0 ? (activeIdx / (PHASE_ORDER.length - 1)) * 100 : 0;
        phaseLine.style.setProperty('--phase-progress', progress + '%');
    }

    const prompt = document.getElementById('stage-prompt');
    const btns = document.getElementById('stage-buttons');
    const intelSlot = document.getElementById('intel-card-slot');
    const actionBar = document.getElementById('action-bar');

    prompt.textContent = '';
    btns.innerHTML = '';
    if (intelSlot) intelSlot.innerHTML = '';

    const isMyTurn = g.currentPlayer === myId;

    // Phase-specific rendering
    switch (g.phase) {
        case 'draw':
            prompt.textContent = isMyTurn ? '正在摸牌...' : `${getName(g.currentPlayer)} 摸牌中`;
            break;

        case 'action':
            if (isMyTurn) {
                prompt.textContent = '选择手牌使用或点击完成';
                btns.innerHTML = `<button class="btn btn-accent btn-sm" id="btn-action-done">完成出牌</button>`;
            } else {
                prompt.textContent = `${getName(g.currentPlayer)} 出牌中...`;
            }
            break;

        case 'transmission':
            if (g.intel.active) {
                // Card lives on the table next to the facing player — not in the stage slot
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

        case 'contention': {
            // Card lives on the table — no duplicate in the stage slot
            const receiverName = getName(g.intel.acceptedBy);
            prompt.textContent = `${receiverName} 将接收情报`;

            if (g.contention.askingPlayer === myId) {
                prompt.textContent = '是否使用争夺牌？';
                btns.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-contention-pass">放弃</button>`;
            } else if (g.contention.askingPlayer) {
                prompt.textContent += ` (${getName(g.contention.askingPlayer)} 决定中)`;
            }
            break;
        }

        case 'reception':
            prompt.textContent = '接收阶段';
            break;

        case 'dying': {
            const dyingName = getName(g.dying.player);
            prompt.textContent = `${dyingName} 濒死！`;

            if (g.dying.askingPlayer === myId) {
                prompt.textContent = `${dyingName} 濒死！是否使用澄清？`;
                // Bug fix #1: remove duplicate branches — single button regardless of hasClarify
                btns.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-rescue-pass">放弃</button>`;
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

    // Show/hide action-bar based on whether there's anything to display
    if (actionBar) {
        const hasContent = prompt.textContent.trim() || btns.innerHTML.trim();
        actionBar.style.display = hasContent ? 'flex' : 'none';
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
    // Pivot is the center-bottom of the fan circle, far below screen
    // Offset 60px so cards sit well above the bottom ribbon
    const pivotX = containerW / 2;
    const pivotY = containerH + R - 60;

    // Determine playable state
    const isMyTurn = g.currentPlayer === st.myId;

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

    const phaseText = card.action_phase === 'action' ? '出牌' : '争夺';

    // Direction arrow: clean CSS arrows
    const dirLabel = card.direction === 'left' ? '←' : card.direction === 'right' ? '→' : '⇄';
    const dirTitle = card.direction === 'left' ? '左传' : card.direction === 'right' ? '右传' : '任意';

    // Build attribute badges
    let badgesHtml = `<span class="card-badge card-badge-dir" title="${dirTitle}">${dirLabel}</span>`;
    if (card.has_lock) badgesHtml += '<span class="card-badge card-badge-lock" title="锁定">锁</span>';
    if (card.has_hidden) badgesHtml += '<span class="card-badge card-badge-hidden" title="暗置">密</span>';

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
