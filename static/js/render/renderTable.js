/**
 * Table rendering — SVG ellipse surface and player avatars.
 */

import { getState } from '../state.js';
import { IDENTITY_NAMES, IDENTITY_COLORS, getName } from '../constants.js';
import { ensureIntelCard, intelRestPosition, setAvatarPositions, setTableEllipse, getAvatarPositions } from '../animations.js';

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

// ── Table Rendering ─────────────────────────────────────────

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
    const cy = h * 0.48;   // slightly above centre — more space at bottom for self avatar
    const rx = w * 0.30;   // narrower → taller-looking oval
    const ry = h * 0.40;   // slightly smaller ry to leave room for avatars outside

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
        // Point on ellipse rim
        const px0 = cx + rx * Math.cos(angle);
        const py0 = cy - ry * Math.sin(angle);
        // Push avatar outward from ellipse centre along the radial direction
        const dx = px0 - cx, dy = py0 - cy;
        const dlen = Math.sqrt(dx * dx + dy * dy) || 1;
        const outset = 34;   // px beyond the ellipse rim
        const x = px0 + (dx / dlen) * outset;
        const y = py0 + (dy / dlen) * outset;

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
