/**
 * Intel card lifecycle and Web Animations API helpers.
 */

// ── Module State ─────────────────────────────────────────

let intelCardEl = null;
let avatarPositions = {};
let tableEllipse = { cx: 0, cy: 0, rx: 0, ry: 0 };

// ── Getters / Setters for shared state ───────────────────

export function getAvatarPositions() { return avatarPositions; }
export function setAvatarPositions(obj) { avatarPositions = obj; }
export function getTableEllipse() { return tableEllipse; }
export function setTableEllipse(obj) { tableEllipse = obj; }

// ── Persistent Table Intel Card ──────────────────────────

export function removeIntelCard() {
    if (intelCardEl) {
        intelCardEl.remove();
        intelCardEl = null;
    }
}

export function ensureIntelCard() {
    const layer = document.getElementById('intel-anim-layer');
    if (!layer) return null;
    if (!intelCardEl || !intelCardEl.parentElement) {
        intelCardEl = document.createElement('div');
        intelCardEl.id = 'intel-on-table';
        intelCardEl.className = 'card-back';
        intelCardEl.style.cssText = `
            width: 48px; height: 72px; font-size: 16px; border-radius: 4px;
            position: absolute; left: 0; top: 0;
            pointer-events: none;
            transform-origin: center center;
            z-index: 62;
            transition: none;
        `;
        layer.appendChild(intelCardEl);
    }
    return intelCardEl;
}

/**
 * Returns the layer-relative resting position {lx, ly} for the card when
 * it sits in front of a player.  Players on the ellipse get a small inward
 * offset so the card appears "on the table" rather than over the avatar.
 */
export function intelRestPosition(pid) {
    const layer = document.getElementById('intel-anim-layer');
    const tableArea = document.getElementById('table-area');
    if (!layer || !tableArea) return null;
    const layerRect = layer.getBoundingClientRect();
    const areaRect  = tableArea.getBoundingClientRect();

    const pos = avatarPositions[pid];
    if (!pos) return null;
    const a = pos.angle;
    // Move card 38px inward (toward table centre) from the avatar
    const inx = -Math.cos(a);
    const iny =  Math.sin(a);
    return {
        lx: areaRect.left + pos.x + inx * 38 - layerRect.left,
        ly: areaRect.top  + pos.y + iny * 38 - layerRect.top,
        angle: a,
    };
}

// ── Intel Arc Animation ──────────────────────────────────

export function animateIntelAlongArc(fromPid, toPid, onComplete) {
    const layer = document.getElementById('intel-anim-layer');
    const tableArea = document.getElementById('table-area');
    if (!layer || !tableArea) { onComplete(); return; }

    const layerRect = layer.getBoundingClientRect();
    const areaRect  = tableArea.getBoundingClientRect();
    const ecx = areaRect.left + tableEllipse.cx - layerRect.left;
    const ecy = areaRect.top  + tableEllipse.cy - layerRect.top;
    const erx = tableEllipse.rx;
    const ery = tableEllipse.ry;

    const from = intelRestPosition(fromPid);
    const to   = intelRestPosition(toPid);
    if (!from || !to) { onComplete(); return; }

    const card = ensureIntelCard();
    if (!card) { onComplete(); return; }

    const STEPS = 48;
    const keyframes = [];

    // Both players are on the ellipse — slide the card along the inset arc
    const inset = 38;
    for (let s = 0; s <= STEPS; s++) {
        const t   = s / STEPS;
        const a   = from.angle + (to.angle - from.angle) * t;
        const inx = -Math.cos(a);
        const iny =  Math.sin(a);
        const px  = ecx + erx * Math.cos(a) + inx * inset;
        const py  = ecy - ery * Math.sin(a) + iny * inset;
        keyframes.push({ transform: `translate(${px - 24}px, ${py - 36}px)` });
    }

    // Duration scales with arc length
    const arcFraction = Math.abs(to.angle - from.angle) / Math.PI;
    const duration = Math.round(400 + 500 * Math.min(arcFraction, 1));

    const anim = card.animate(keyframes, {
        duration,
        easing: 'ease-in-out',
        fill: 'forwards',
    });

    anim.onfinish = () => {
        // Commit final position as inline style so the card STAYS there
        card.style.transform = keyframes[keyframes.length - 1].transform;
        onComplete();
    };
}

// ── Intel Reveal Animation ───────────────────────────────

export function animateIntelReveal(color, receiverPid, onComplete) {
    const layer = document.getElementById('intel-anim-layer');
    if (!layer) { onComplete(); return; }

    // Position the reveal at the receiver's avatar on the table
    let cx, cy;
    const rp = intelRestPosition(receiverPid);
    if (rp) {
        cx = rp.lx - 24;   // rp.lx is card centre; subtract half-card for left
        cy = rp.ly - 36;   // rp.ly is card centre; subtract half-card for top
    } else {
        // Fallback: centre of screen
        const layerRect2 = layer.getBoundingClientRect();
        cx = layerRect2.width  / 2 - 24;
        cy = layerRect2.height / 2 - 36;
    }

    // Create 3D flip container
    const container = document.createElement('div');
    container.className = 'card-3d';
    container.style.cssText = `
        position: absolute; left: ${cx}px; top: ${cy}px;
        width: 48px; height: 72px;
        transform-style: preserve-3d;
        pointer-events: none;
    `;

    // Back face (initially visible)
    const backFace = document.createElement('div');
    backFace.className = 'card-back card-back-face';
    backFace.style.cssText = `
        width: 48px; height: 72px; font-size: 16px; border-radius: 4px;
        position: absolute; inset: 0;
        backface-visibility: hidden;
    `;

    // Front face (the colored intel card)
    const colorBgs = {
        red: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 50%, #c0392b 100%)',
        blue: 'linear-gradient(135deg, #2471a3 0%, #3498db 50%, #2471a3 100%)',
        black: 'linear-gradient(135deg, #1c2833 0%, #2c3e50 50%, #1c2833 100%)',
    };
    const colorLabels = { red: '红', blue: '蓝', black: '黑' };

    const frontFace = document.createElement('div');
    frontFace.className = 'card-front';
    frontFace.style.cssText = `
        width: 48px; height: 72px; border-radius: 4px;
        position: absolute; inset: 0;
        backface-visibility: hidden;
        transform: rotateY(180deg);
        background: ${colorBgs[color] || colorBgs.black};
        border: 1.5px solid rgba(255,255,255,0.2);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; font-weight: 700; color: #fff;
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    `;
    frontFace.textContent = colorLabels[color] || '?';

    container.appendChild(backFace);
    container.appendChild(frontFace);
    layer.appendChild(container);

    // Flip animation: rotateY 0 → 180 with scale pulse
    const flipKeyframes = [
        { transform: 'rotateY(0deg) scale(1.0)', offset: 0 },
        { transform: 'rotateY(90deg) scale(1.1)', offset: 0.4 },
        { transform: 'rotateY(180deg) scale(1.05)', offset: 0.6 },
        { transform: 'rotateY(180deg) scale(1.0)', offset: 1.0 },
    ];

    const anim = container.animate(flipKeyframes, {
        duration: 1200,
        easing: 'ease-in-out',
        fill: 'forwards',
    });

    anim.onfinish = () => {
        // Hold for 600ms then remove
        setTimeout(() => {
            container.remove();
            onComplete();
        }, 600);
    };
}
