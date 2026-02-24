/**
 * Table rendering — three-layer concentric circular SVG.
 * Player pills are arc-aligned SVG capsules with indicator circles.
 */

import { getState } from '../state.js';
import { setAvatarPositions, setTableGeometry, getAvatarPositions, updateIntelArcPosition } from '../animations.js';

const NS = 'http://www.w3.org/2000/svg';

// ── Geometry Helpers ──────────────────────────────────────────

function ptC(cx, cy, r, a) {
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function wedgePath(cx, cy, rIn, rOut, a1, a2) {
    const span = Math.abs(a2 - a1);
    const large = span > Math.PI + 0.001 ? 1 : 0;
    const p1 = ptC(cx, cy, rIn, a1);
    const p2 = ptC(cx, cy, rIn, a2);
    const p3 = ptC(cx, cy, rOut, a2);
    const p4 = ptC(cx, cy, rOut, a1);
    return [
        `M ${p1.x} ${p1.y}`,
        `A ${rIn} ${rIn} 0 ${large} 0 ${p2.x} ${p2.y}`,
        `L ${p3.x} ${p3.y}`,
        `A ${rOut} ${rOut} 0 ${large} 1 ${p4.x} ${p4.y}`,
        'Z'
    ].join(' ');
}

function circlePath(cx, cy, r) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
}

function annulusPath(cx, cy, rIn, rOut) {
    return [
        `M ${cx - rOut} ${cy} A ${rOut} ${rOut} 0 1 1 ${cx + rOut} ${cy} A ${rOut} ${rOut} 0 1 1 ${cx - rOut} ${cy} Z`,
        `M ${cx - rIn} ${cy} A ${rIn} ${rIn} 0 1 0 ${cx + rIn} ${cy} A ${rIn} ${rIn} 0 1 0 ${cx - rIn} ${cy} Z`
    ].join(' ');
}

/**
 * Closed capsule shape aligned with a circular arc.
 * Inner arc → right end-cap semicircle → outer arc (reverse) → left end-cap semicircle.
 */
function capsulePath(cx, cy, rCap, t, aStart, aEnd) {
    const span = Math.abs(aEnd - aStart);
    if (span < 0.001) {
        // Degenerate: single point → draw a circle
        const c = ptC(cx, cy, rCap, aStart);
        return circlePath(c.x, c.y, t);
    }
    const rIn = rCap - t;
    const rOut = rCap + t;
    const large = span > Math.PI + 0.001 ? 1 : 0;
    const iS = ptC(cx, cy, rIn, aStart);
    const iE = ptC(cx, cy, rIn, aEnd);
    const oE = ptC(cx, cy, rOut, aEnd);
    const oS = ptC(cx, cy, rOut, aStart);
    return [
        `M ${iS.x} ${iS.y}`,
        `A ${rIn} ${rIn} 0 ${large} 0 ${iE.x} ${iE.y}`,  // inner arc (CCW)
        `A ${t} ${t} 0 0 0 ${oE.x} ${oE.y}`,              // right end-cap
        `A ${rOut} ${rOut} 0 ${large} 1 ${oS.x} ${oS.y}`,  // outer arc (CW back)
        `A ${t} ${t} 0 0 1 ${iS.x} ${iS.y}`,              // left end-cap
        'Z'
    ].join(' ');
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

// ── SVG Filter Definitions ──────────────────────────────────

function createDefs() {
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = `
        <filter id="inset-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feFlood flood-color="rgba(163,177,198,0.5)"/>
            <feComposite in2="SourceGraphic" operator="in"/>
            <feOffset dx="3" dy="3"/>
            <feGaussianBlur stdDeviation="4"/>
            <feComposite in2="SourceGraphic" operator="in" result="dark"/>
            <feFlood flood-color="rgba(255,255,255,0.7)"/>
            <feComposite in2="SourceGraphic" operator="in"/>
            <feOffset dx="-3" dy="-3"/>
            <feGaussianBlur stdDeviation="4"/>
            <feComposite in2="SourceGraphic" operator="in" result="light"/>
            <feMerge>
                <feMergeNode in="SourceGraphic"/>
                <feMergeNode in="dark"/>
                <feMergeNode in="light"/>
            </feMerge>
        </filter>
        <filter id="wedge-glow-active">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
            <feFlood flood-color="rgba(61,153,112,0.3)"/>
            <feComposite in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="wedge-glow-facing">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
            <feFlood flood-color="rgba(26,39,68,0.3)"/>
            <feComposite in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="pill-raised" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur1"/>
            <feOffset in="blur1" dx="5" dy="5" result="offDark"/>
            <feFlood flood-color="rgba(143,157,178,0.8)" result="colorDark"/>
            <feComposite in="colorDark" in2="offDark" operator="in" result="shadowDark"/>
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur2"/>
            <feOffset in="blur2" dx="-5" dy="-5" result="offLight"/>
            <feFlood flood-color="rgba(255,255,255,1)" result="colorLight"/>
            <feComposite in="colorLight" in2="offLight" operator="in" result="shadowLight"/>
            <feMerge>
                <feMergeNode in="shadowDark"/>
                <feMergeNode in="shadowLight"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    `;
    return defs;
}

// ── Pill sizing constants ────────────────────────────────────

const CIRC_R = 9;            // indicator circle radius
const ARC_GAP = 22;          // px between circle centers along the arc
const CAP_T = CIRC_R + 4;    // capsule half-thickness (circle + padding)

// ── Table Rendering ─────────────────────────────────────────

export function renderTable() {
    const st = getState();
    const g = st.game;
    const area = document.getElementById('table-area');

    const allIds = g.turnOrder;
    const N = allIds.length;
    if (N === 0) return;

    const w = area.clientWidth || 360;
    const h = area.clientHeight || 200;
    const cx = w / 2;
    const cy = h * 0.47;

    const R = Math.min(w / 2, h * 0.47) * 0.90;

    // Ring radii
    const rInner  = R * 0.25;
    const rMidIn  = R * 0.325;
    const rMidOut = R * 0.65;
    const rOutIn  = R * 0.675;
    const rOutOut = R;
    const rCap    = (rOutIn + rOutOut) / 2;

    // Geometry export objects
    const inner = { rx: rInner, ry: rInner };
    const midIn = { rx: rMidIn, ry: rMidIn };
    const midOut = { rx: rMidOut, ry: rMidOut };
    const outIn = { rx: rOutIn, ry: rOutIn };
    const outOut = { rx: rOutOut, ry: rOutOut };

    // Player angles
    const selfIdx = allIds.indexOf(st.myId);
    const halfSpan = Math.PI / N;
    const playerAngles = {};
    for (let i = 0; i < N; i++) {
        const offset = (i - selfIdx + N) % N;
        playerAngles[allIds[i]] = -Math.PI / 2 + (2 * Math.PI * offset / N);
    }

    setTableGeometry({ cx, cy, inner, midIn, midOut, outIn, outOut, playerAngles, N, w, h });

    // ── Preserve persistent intel-arc-svg ──
    let intelSvg = area.querySelector('.intel-arc-svg');
    if (intelSvg) area.removeChild(intelSvg);
    area.innerHTML = '';

    // ── Main SVG ──
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('class', 'table-svg');
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;';
    svg.appendChild(createDefs());

    // Layer 1: Inner circle
    const innerEl = document.createElementNS(NS, 'path');
    innerEl.setAttribute('d', circlePath(cx, cy, rInner));
    innerEl.setAttribute('class', 'inner-surface');
    innerEl.setAttribute('filter', 'url(#inset-shadow)');
    svg.appendChild(innerEl);

    // Layer 2: Middle ring wedges
    const middleG = document.createElementNS(NS, 'g');
    middleG.setAttribute('class', 'middle-ring');
    for (let i = 0; i < N; i++) {
        const pid = allIds[i];
        const angle = playerAngles[pid];
        const a1 = angle - halfSpan;
        const a2 = angle + halfSpan;
        const isSelf = pid === st.myId;
        const p = isSelf
            ? { handCount: g.myHand.length, intelArea: g.myIntel || [], alive: true }
            : g.players[pid];
        if (!p) continue;

        const isActive = pid === g.currentPlayer;
        const isFacing = g.intel.active && pid === g.intel.facing;
        const isDead = !p.alive;

        const wedge = document.createElementNS(NS, 'path');
        wedge.setAttribute('d', wedgePath(cx, cy, rMidIn, rMidOut, a1, a2));
        let cls = 'wedge';
        if (isActive) cls += ' wedge-active';
        if (isFacing) cls += ' wedge-facing';
        if (isDead) cls += ' wedge-dead';
        wedge.setAttribute('class', cls);
        wedge.setAttribute('data-pid', pid);
        if (isActive) wedge.setAttribute('filter', 'url(#wedge-glow-active)');
        else if (isFacing) wedge.setAttribute('filter', 'url(#wedge-glow-facing)');
        wedge.style.pointerEvents = 'all';
        middleG.appendChild(wedge);

        if (N > 1) {
            const s1 = ptC(cx, cy, rMidIn, a2);
            const s2 = ptC(cx, cy, rMidOut, a2);
            const sep = document.createElementNS(NS, 'line');
            sep.setAttribute('x1', String(s1.x));
            sep.setAttribute('y1', String(s1.y));
            sep.setAttribute('x2', String(s2.x));
            sep.setAttribute('y2', String(s2.y));
            sep.setAttribute('class', 'wedge-separator');
            middleG.appendChild(sep);
        }
    }
    svg.appendChild(middleG);

    // Layer 3: Outer ring background
    const outerBg = document.createElementNS(NS, 'path');
    outerBg.setAttribute('d', annulusPath(cx, cy, rOutIn, rOutOut));
    outerBg.setAttribute('class', 'outer-ring-bg');
    outerBg.setAttribute('fill-rule', 'evenodd');
    outerBg.setAttribute('filter', 'url(#inset-shadow)');
    svg.appendChild(outerBg);

    // Layer 4: Player pills
    const pillLayer = document.createElementNS(NS, 'g');
    pillLayer.setAttribute('class', 'pill-layer');
    const angleStep = ARC_GAP / rCap;

    const newPositions = {};

    for (let i = 0; i < N; i++) {
        const pid = allIds[i];
        const angle = playerAngles[pid];
        const isSelf = pid === st.myId;
        const p = isSelf
            ? { handCount: g.myHand.length, intelArea: g.myIntel || [], alive: true }
            : g.players[pid];
        if (!p) continue;

        const isDead = !p.alive;
        const displayChar = isSelf ? '我' : (g.playerNames[pid] || pid).charAt(0);

        const cpos = ptC(cx, cy, rCap, angle);
        newPositions[pid] = { x: cpos.x, y: cpos.y, angle };

        // Build indicator list
        const indicators = [
            { type: 'name', text: displayChar },
            { type: 'count', text: String(p.handCount) },
        ];
        for (const c of p.intelArea) {
            indicators.push({ type: 'intel', color: c.intel_color });
        }

        const count = indicators.length;
        const totalSpan = (count - 1) * angleStep;
        const aStart = angle - totalSpan / 2;
        const aEnd   = angle + totalSpan / 2;

        // Player pill group
        const pg = document.createElementNS(NS, 'g');
        pg.setAttribute('class', 'player-pill-g' + (isDead ? ' pill-dead' : ''));
        if (!isSelf) pg.setAttribute('data-pid', pid);
        pg.style.pointerEvents = 'all';

        // Capsule background — filled closed path with neumorphic raised filter
        const cap = document.createElementNS(NS, 'path');
        cap.setAttribute('d', capsulePath(cx, cy, rCap, CAP_T, aStart, aEnd));
        cap.setAttribute('class', 'pill-bg');
        cap.setAttribute('filter', 'url(#pill-raised)');
        pg.appendChild(cap);

        // Indicator circles + text along the arc
        for (let j = 0; j < count; j++) {
            const ind = indicators[j];
            const indAngle = aStart + j * angleStep;
            const ip = ptC(cx, cy, rCap, indAngle);

            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', String(ip.x));
            circle.setAttribute('cy', String(ip.y));
            circle.setAttribute('r', String(CIRC_R));
            if (ind.type === 'intel') {
                circle.setAttribute('class', 'pill-circle pill-intel-' + ind.color);
            } else {
                circle.setAttribute('class', 'pill-circle pill-circle-' + ind.type);
            }
            pg.appendChild(circle);

            if (ind.text) {
                const txt = document.createElementNS(NS, 'text');
                txt.setAttribute('x', String(ip.x));
                txt.setAttribute('y', String(ip.y));
                txt.setAttribute('class', 'pill-text');
                txt.textContent = ind.text;
                pg.appendChild(txt);
            }
        }

        pillLayer.appendChild(pg);
    }
    svg.appendChild(pillLayer);

    area.appendChild(svg);

    // ── Persistent intel-arc-svg ──
    if (!intelSvg) {
        intelSvg = document.createElementNS(NS, 'svg');
        intelSvg.setAttribute('class', 'intel-arc-svg');
        intelSvg.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none;overflow:visible;`;

        const arcPath = document.createElementNS(NS, 'path');
        arcPath.setAttribute('id', 'intel-arc');
        arcPath.setAttribute('class', 'intel-arc hidden');
        intelSvg.appendChild(arcPath);

        const revealEllipse = document.createElementNS(NS, 'ellipse');
        revealEllipse.setAttribute('id', 'intel-reveal-ellipse');
        revealEllipse.setAttribute('class', 'intel-reveal hidden');
        intelSvg.appendChild(revealEllipse);

        const revealText = document.createElementNS(NS, 'text');
        revealText.setAttribute('id', 'intel-reveal-text');
        revealText.setAttribute('class', 'intel-reveal-text hidden');
        intelSvg.appendChild(revealText);
    } else {
        intelSvg.style.width = w + 'px';
        intelSvg.style.height = h + 'px';
    }
    area.appendChild(intelSvg);

    setAvatarPositions(newPositions);

    if (g.intel.active && g.intel.facing) {
        updateIntelArcPosition(g.intel.facing);
    }
}
