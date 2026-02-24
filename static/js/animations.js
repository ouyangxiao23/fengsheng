/**
 * Intel arc lifecycle, animation helpers, and played-card floats.
 */

// ── Module State ─────────────────────────────────────────

let avatarPositions = {};
let tableGeometry = null;

// ── Getters / Setters for shared state ───────────────────

export function getAvatarPositions() { return avatarPositions; }
export function setAvatarPositions(obj) { avatarPositions = obj; }
export function setTableGeometry(obj) { tableGeometry = obj; }
export function getTableGeometry() { return tableGeometry; }

// ── Geometry Helpers ─────────────────────────────────────

function ptOnEllipse(cx, cy, rx, ry, a) {
    return { x: cx + rx * Math.cos(a), y: cy - ry * Math.sin(a) };
}

function intelArcPath(cx, cy, rx, ry, centerAngle, halfSpan) {
    const a1 = centerAngle - halfSpan;
    const a2 = centerAngle + halfSpan;
    const span = Math.abs(a2 - a1);
    const large = span > Math.PI + 0.001 ? 1 : 0;
    const p1 = ptOnEllipse(cx, cy, rx, ry, a1);
    const p2 = ptOnEllipse(cx, cy, rx, ry, a2);
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${rx} ${ry} 0 ${large} 0 ${p2.x} ${p2.y} Z`;
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── Player Arc Angle ─────────────────────────────────────

export function getPlayerArcAngle(pid) {
    if (!tableGeometry) return null;
    const angle = tableGeometry.playerAngles[pid];
    if (angle === undefined) return null;
    return { centerAngle: angle, halfSpan: Math.PI / tableGeometry.N };
}

// ── Persistent Intel Arc ─────────────────────────────────

export function ensureIntelArc() {
    return document.getElementById('intel-arc') || null;
}

export function removeIntelArc() {
    const arc = document.getElementById('intel-arc');
    if (arc) arc.classList.add('hidden');
    const reveal = document.getElementById('intel-reveal-ellipse');
    if (reveal) reveal.classList.add('hidden');
    const text = document.getElementById('intel-reveal-text');
    if (text) text.classList.add('hidden');
}

// Backward-compatible aliases for handler imports
export { removeIntelArc as removeIntelCard };
export { ensureIntelArc as ensureIntelCard };

// ── Update Intel Arc Position ────────────────────────────

export function updateIntelArcPosition(pid) {
    if (!tableGeometry) return;
    const arc = document.getElementById('intel-arc');
    if (!arc) return;
    const info = getPlayerArcAngle(pid);
    if (!info) return;

    const d = intelArcPath(
        tableGeometry.cx, tableGeometry.cy,
        tableGeometry.inner.rx, tableGeometry.inner.ry,
        info.centerAngle, info.halfSpan
    );
    arc.setAttribute('d', d);
    arc.classList.remove('hidden');
}

// ── Card From Hand Animation ─────────────────────────────

/**
 * Animates a card-back from a screen position (where the hand card was)
 * to the sender's section on the inner ellipse, then shows the intel arc.
 */
export function animateCardFromHand(startRect, toPid, onComplete) {
    const layer = document.getElementById('intel-anim-layer');
    const tableArea = document.getElementById('table-area');
    if (!layer || !tableArea || !tableGeometry) { onComplete(); return; }

    const layerRect = layer.getBoundingClientRect();
    const areaRect = tableArea.getBoundingClientRect();

    // Start position (centre of the hand card, layer-relative)
    let sx, sy;
    if (startRect) {
        sx = startRect.left + startRect.width / 2 - layerRect.left - 24;
        sy = startRect.top + startRect.height / 2 - layerRect.top - 36;
    } else {
        sx = layerRect.width / 2 - 24;
        sy = layerRect.height - 36;
    }

    // End position: center of sender's section on inner ellipse (layer-relative)
    const angle = tableGeometry.playerAngles[toPid];
    if (angle === undefined) { onComplete(); return; }
    const target = ptOnEllipse(tableGeometry.cx, tableGeometry.cy,
        tableGeometry.inner.rx, tableGeometry.inner.ry, angle);
    const ex = areaRect.left + target.x - layerRect.left - 24;
    const ey = areaRect.top + target.y - layerRect.top - 36;

    // Create a temporary card-back for the flight
    const temp = document.createElement('div');
    temp.className = 'card-back';
    temp.style.cssText = `
        width: 48px; height: 72px; font-size: 16px; border-radius: 4px;
        position: absolute; left: 0; top: 0;
        pointer-events: none;
        z-index: 63;
        transform: translate(${sx}px, ${sy}px) scale(1.3);
    `;
    layer.appendChild(temp);

    const anim = temp.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(1.3)`, opacity: 1 },
        { transform: `translate(${ex}px, ${ey}px) scale(0.5)`, opacity: 0.7 },
    ], {
        duration: 420,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
    });

    anim.onfinish = () => {
        temp.remove();
        // Show the intel arc at sender's section
        updateIntelArcPosition(toPid);
        onComplete();
    };
}

// ── Played Card Float Near Avatar ────────────────────────

export function showPlayedCard(playerId, cardEl) {
    const layer = document.getElementById('intel-anim-layer');
    const tableArea = document.getElementById('table-area');
    if (!layer || !tableArea) return;

    const layerRect = layer.getBoundingClientRect();
    const areaRect  = tableArea.getBoundingClientRect();
    const pos = avatarPositions[playerId];
    if (!pos) return;

    // Position inward from avatar toward table center
    const a = pos.angle;
    const inX = -Math.cos(a);
    const inY =  Math.sin(a);
    const offset = 40;
    const lx = areaRect.left + pos.x + inX * offset - layerRect.left;
    const ly = areaRect.top  + pos.y + inY * offset - layerRect.top;

    // Stack offset: count existing floats for this player
    const existing = layer.querySelectorAll(`.played-card-float[data-player="${playerId}"]`);
    const stackOffset = existing.length * 12;

    // Wrap the card element
    const wrap = document.createElement('div');
    wrap.className = 'played-card-float';
    wrap.dataset.player = playerId;
    wrap.style.cssText = `
        position: absolute;
        left: ${lx - 36}px;
        top: ${ly - 54 - stackOffset}px;
        transform: scale(0.55);
        transform-origin: center center;
        pointer-events: none;
        z-index: 65;
        opacity: 0;
    `;
    wrap.appendChild(cardEl);
    layer.appendChild(wrap);

    // Pop-in animation
    const popIn = wrap.animate([
        { transform: 'scale(0.3)', opacity: 0 },
        { transform: 'scale(0.6)', opacity: 1 },
        { transform: 'scale(0.55)', opacity: 1 },
    ], { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' });

    popIn.onfinish = () => {
        setTimeout(() => {
            const fadeOut = wrap.animate([
                { opacity: 1 },
                { opacity: 0 },
            ], { duration: 400, easing: 'ease-out', fill: 'forwards' });
            fadeOut.onfinish = () => wrap.remove();
        }, 2500);
    };
}

// ── Intel Arc Morph Animation ────────────────────────────

export function animateIntelAlongArc(fromPid, toPid, onComplete, direction) {
    if (!tableGeometry) { onComplete(); return; }

    const fromInfo = getPlayerArcAngle(fromPid);
    const toInfo = getPlayerArcAngle(toPid);
    if (!fromInfo || !toInfo) { onComplete(); return; }

    const arc = ensureIntelArc();
    if (!arc) { onComplete(); return; }

    // Ensure arc is visible at the from position
    updateIntelArcPosition(fromPid);

    const fromAngle = fromInfo.centerAngle;
    const toAngle = toInfo.centerAngle;
    const halfSpan = fromInfo.halfSpan;

    let delta = toAngle - fromAngle;
    if (direction === 'right') {
        if (delta <= 0) delta += 2 * Math.PI;
    } else if (direction === 'left') {
        if (delta >= 0) delta -= 2 * Math.PI;
    } else {
        // Straight / shortest path
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
    }

    // Duration scales with angular distance
    const arcFraction = Math.abs(delta) / Math.PI;
    const duration = Math.round(400 + 500 * Math.min(arcFraction, 1));

    const { cx, cy, inner } = tableGeometry;
    const start = performance.now();

    function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeInOut(t);
        const currentAngle = fromAngle + delta * eased;
        const d = intelArcPath(cx, cy, inner.rx, inner.ry, currentAngle, halfSpan);
        arc.setAttribute('d', d);
        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            onComplete();
        }
    }
    requestAnimationFrame(frame);
}

// ── Intel Reveal Animation ───────────────────────────────

export function animateIntelReveal(color, receiverPid, onComplete) {
    if (!tableGeometry) { onComplete(); return; }

    const info = getPlayerArcAngle(receiverPid);
    if (!info) { onComplete(); return; }

    const arc = document.getElementById('intel-arc');
    const revealEl = document.getElementById('intel-reveal-ellipse');
    const revealText = document.getElementById('intel-reveal-text');
    if (!arc) { onComplete(); return; }

    const { cx, cy, inner } = tableGeometry;
    const halfSpan = info.halfSpan;
    const centerAngle = info.centerAngle;

    const colorMap = {
        red: '#c45c5c',
        blue: '#4a7fb5',
        black: '#4e5a6e',
    };
    const colorLabels = { red: '红', blue: '蓝', black: '黑' };
    const fillColor = colorMap[color] || colorMap.black;

    // Phase 1: Arc shrinks toward center (400ms)
    const phase1Duration = 400;
    const phase1Start = performance.now();

    function phase1(now) {
        const t = Math.min(1, (now - phase1Start) / phase1Duration);
        const eased = easeInOut(t);
        const currentHalfSpan = halfSpan * (1 - eased * 0.8);
        const currentRx = inner.rx * (1 - eased * 0.7);
        const currentRy = inner.ry * (1 - eased * 0.7);

        const d = intelArcPath(cx, cy, currentRx, currentRy, centerAngle, currentHalfSpan);
        arc.setAttribute('d', d);

        if (t < 1) {
            requestAnimationFrame(phase1);
        } else {
            arc.classList.add('hidden');
            startPhase2();
        }
    }

    function startPhase2() {
        if (!revealEl || !revealText) { onComplete(); return; }

        // Phase 2: Colored ellipse at center with text (600ms)
        const erx = 24;
        const ery = 18;
        revealEl.setAttribute('cx', String(cx));
        revealEl.setAttribute('cy', String(cy));
        revealEl.setAttribute('rx', String(erx));
        revealEl.setAttribute('ry', String(ery));
        revealEl.style.fill = fillColor;
        revealEl.style.opacity = '1';
        revealEl.classList.remove('hidden');

        revealText.setAttribute('x', String(cx));
        revealText.setAttribute('y', String(cy));
        revealText.textContent = colorLabels[color] || '?';
        revealText.style.opacity = '1';
        revealText.classList.remove('hidden');

        const phase2Duration = 600;
        const phase2Start = performance.now();

        function phase2(now) {
            const t = Math.min(1, (now - phase2Start) / phase2Duration);
            const scale = 1 + 0.15 * Math.sin(t * Math.PI);
            revealEl.setAttribute('transform',
                `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`);
            revealText.setAttribute('transform',
                `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`);

            if (t < 1) {
                requestAnimationFrame(phase2);
            } else {
                revealEl.removeAttribute('transform');
                revealText.removeAttribute('transform');
                // Phase 3: Hold 800ms then fade out 400ms
                setTimeout(() => {
                    const fadeDuration = 400;
                    const fadeStart = performance.now();
                    function phase3(now) {
                        const t = Math.min(1, (now - fadeStart) / fadeDuration);
                        const opacity = 1 - t;
                        revealEl.style.opacity = String(opacity);
                        revealText.style.opacity = String(opacity);
                        if (t < 1) {
                            requestAnimationFrame(phase3);
                        } else {
                            revealEl.classList.add('hidden');
                            revealText.classList.add('hidden');
                            revealEl.style.opacity = '1';
                            revealText.style.opacity = '1';
                            onComplete();
                        }
                    }
                    requestAnimationFrame(phase3);
                }, 800);
            }
        }
        requestAnimationFrame(phase2);
    }

    requestAnimationFrame(phase1);
}
