// Mock Data for Initial Render
const MOCK_STATE = {
    myId: 'player-me',
    players: [
        { id: 'p1', name: 'Alpha', handCount: 3, intel: { red: 1, blue: 0, black: 0 }, active: false },
        { id: 'p2', name: 'Bravo', handCount: 5, intel: { red: 0, blue: 2, black: 1 }, active: true },
        { id: 'p3', name: 'Charlie', handCount: 2, intel: { red: 0, blue: 0, black: 0 }, active: false },
        { id: 'p4', name: 'Delta', handCount: 4, intel: { red: 1, blue: 1, black: 0 }, active: false },
        { id: 'p5', name: 'Echo', handCount: 1, intel: { red: 0, blue: 0, black: 0 }, active: false },
    ],
    myHand: [
        { id: 'c1', type: 'red', name: 'Intel', symbol: '🔴' },
        { id: 'c2', type: 'blue', name: 'Intel', symbol: '🔵' },
        { id: 'c3', type: 'action', name: 'Probe', symbol: '🔍' },
        { id: 'c4', type: 'black', name: 'False', symbol: '❌' },
        { id: 'c5', type: 'action', name: 'Lock', symbol: '🎯' },
    ],
    myIntel: { red: 2, blue: 1, black: 0 }
};

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    // Initialize Resize Handler + Call once
    window.addEventListener('resize', handleResize);
    handleResize();

    renderTable(MOCK_STATE.players);
    renderHand(MOCK_STATE.myHand);
    renderMyIntel(MOCK_STATE.myIntel);
});

function initUI() {
    console.log("Secret Mission UI Initialized");
}

function handleResize() {
    const app = document.getElementById('app');
    const baseWidth = 600;

    const windowRatio = window.innerWidth / window.innerHeight;
    // Standard 9:16 is 0.5625. If screen is wider (Desktop/Tablet), restrict height to simulate phone
    // If screen is taller (Modern Phone 9:21), Expand height to fill
    const maxPhoneRatio = 0.6; // Slightly wider than 9:16 allowance

    let scale, height;

    if (windowRatio > maxPhoneRatio) {
        // Desktop / Landscape Mode: Contain height-wise
        // We fix the internal aspect to 9:16 (Standard Phone) for consistency on desktop
        const baseHeight = 960;
        scale = window.innerHeight / baseHeight;
        height = baseHeight;
    } else {
        // Portrait / Phone Mode: Fit Width, Expand Height
        scale = window.innerWidth / baseWidth;
        height = window.innerHeight / scale;
    }

    app.style.setProperty('--app-scale', scale);
    app.style.height = `${height}px`; // Use setProperty for variable? No, height is style.

    console.log(`Resized: Scale ${scale.toFixed(3)}, Internal Height ${height.toFixed(0)}`);

    // Re-render layout reliant on dimensions
    // Use requestAnimationFrame to ensure style has applied
    requestAnimationFrame(() => {
        renderTable(MOCK_STATE.players);
        renderHand(MOCK_STATE.myHand);
    });
}

/* --- Rendering Functions --- */

function renderTable(players) {
    const tableEl = document.getElementById('table-area');
    tableEl.innerHTML = '';

    // Use the full app container for positioning
    const appEl = document.getElementById('app');
    const containerWidth = appEl.offsetWidth;
    const containerHeight = appEl.offsetHeight;

    const centerX = containerWidth / 2;
    // Ellipse center relative to App height
    // Matches CSS top: 40%
    const centerY = containerHeight * 0.40;

    // Ellipse radii
    // We adjust X/Y radius to accommodate the large avatars (approx 75px radius themselves)
    const radiusX = containerWidth * 0.42; // Slightly reduced to keep padding
    const radiusY = containerHeight * 0.35;

    // Range: -20 deg (Right-Bottom) to 200 deg (Left-Bottom)
    // We want EQUAL DISTANCE placement, not equal angle.
    const startAngleDeg = -20;
    const endAngleDeg = 200;
    const startRad = startAngleDeg * (Math.PI / 180);
    const endRad = endAngleDeg * (Math.PI / 180);

    // 1. Calculate Arc Length Table
    // We'll step through the arc and map Distance -> Angle
    const steps = 100;
    const dt = (endRad - startRad) / steps;
    let distangleMap = []; // [distance, angle]
    let currentLen = 0;

    // Push start
    distangleMap.push({ dist: 0, angle: startRad });

    for (let i = 1; i <= steps; i++) {
        const tPrev = startRad + (i - 1) * dt;
        // Approximate segment length using standard Euclidean dist for small dt
        // dx/dt = -a sin t, dy/dt = b cos t
        // ds = sqrt( (a sin t)^2 + (b cos t)^2 ) * dt

        // Midpoint approximation for better accuracy?
        // Let's just use the derivative at tPrev.
        const dx_dt = -radiusX * Math.sin(tPrev);
        const dy_dt = radiusY * Math.cos(tPrev); // Screen coordinates Y is inverted, but length is same magnitude
        // Actually since y = cy - radiusY * sin(t), dy/dt = -radiusY * cos(t). Squared is same.

        const ds = Math.sqrt(dx_dt * dx_dt + dy_dt * dy_dt) * dt;
        currentLen += ds;
        distangleMap.push({ dist: currentLen, angle: startRad + i * dt });
    }

    const totalArcLength = currentLen;

    // 2. Determine target distances for N players
    if (players.length === 0) return;

    // If only 1 player, place at top (90 deg) or mid distance?
    // User wants "equal distance each player travels".
    // 6 players total -> 5 opponents.
    // They are inclusive of start and end points?
    // "Spread them out" usually means endpoints are occupied or centered.
    // Let's assume endpoints are occupied for max spread.
    const segmentLen = players.length > 1 ? totalArcLength / (players.length - 1) : 0;

    players.forEach((p, index) => {
        let angleRad;

        if (players.length === 1) {
            angleRad = 90 * (Math.PI / 180);
        } else {
            const targetDist = index * segmentLen;

            // Find angle for targetDist in lookup table
            // Simple linear scan or find
            // distangleMap is sorted by dist
            let upperIndex = distangleMap.findIndex(entry => entry.dist >= targetDist);
            if (upperIndex === -1) upperIndex = distangleMap.length - 1;
            if (upperIndex === 0) upperIndex = 1; // Safety

            const p1 = distangleMap[upperIndex - 1];
            const p2 = distangleMap[upperIndex];

            // Interpolate
            const ratio = (targetDist - p1.dist) / (p2.dist - p1.dist + 0.00001);
            angleRad = p1.angle + ratio * (p2.angle - p1.angle);
        }

        // Calculate center point
        const x = centerX + radiusX * Math.cos(angleRad);
        const y = centerY - radiusY * Math.sin(angleRad);

        const avatar = createAvatar(p);
        avatar.style.left = `${x}px`;
        avatar.style.top = `${y}px`;

        tableEl.appendChild(avatar);
    });
}

function createAvatar(player) {
    const div = document.createElement('div');
    div.className = 'avatar-container';

    const avatarCircle = document.createElement('div');
    avatarCircle.className = `avatar ${player.active ? 'active-turn' : ''}`;
    avatarCircle.textContent = player.name.charAt(0);

    // Hand Count Badge
    const badge = document.createElement('div');
    badge.className = 'hand-count';
    badge.textContent = player.handCount;
    avatarCircle.appendChild(badge);

    // Intel Pips
    const pips = document.createElement('div');
    pips.className = 'avatar-badges';
    pips.innerHTML = `
        <div class="badge-pip pip-red"></div>
        <div class="badge-pip pip-blue"></div>
    `; // Simplified for mock

    div.appendChild(avatarCircle);
    div.appendChild(pips);
    return div;
}

function renderHand(cards) {
    const handEl = document.getElementById('my-hand');
    handEl.innerHTML = '';

    // Use container width
    const containerWidth = handEl.offsetWidth || window.innerWidth;
    const cardWidth = 120; // Updated to match CSS
    const overlap = 80;

    // Total visual width of the hand fan
    const totalHandWidth = (cards.length - 1) * overlap + cardWidth;

    // Center it: (Container - TotalHand) / 2
    let startX = (containerWidth - totalHandWidth) / 2;
    // ensure not negative for scrolling
    if (startX < 20) startX = 20;

    cards.forEach((c, index) => {
        const card = createCard(c);
        card.classList.add('card-in-hand');

        // Calculate Fan Constants
        const centerIndex = (cards.length - 1) / 2;
        const distFromCenter = index - centerIndex;

        // Position Logic
        const rotate = distFromCenter * 5;
        const x = startX + (index * overlap);
        // Quadratic curve: y = C * x^2. Push outer cards down.
        const y = Math.abs(distFromCenter) * Math.abs(distFromCenter) * 4;

        // Apply Styles
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        card.dataset.baseTop = y; // Store base Y for interaction reset
        card.style.zIndex = index;

        // We need to apply rotation in JS. 
        // We will maintain this rotation even when selected.
        card.dataset.rotation = rotate;
        card.style.transform = `rotate(${rotate}deg)`;

        // Add interaction
        // Use 'pointerdown' or 'click'. Click is usually fine for hybrid but let's stick to click 
        // and ensure we manage state.
        card.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling if we have background click later

            const isSelected = card.classList.contains('selected');

            // Reset all cards
            document.querySelectorAll('.card-in-hand').forEach(el => {
                el.classList.remove('selected');
                el.style.top = `${el.dataset.baseTop}px`;
                el.style.transform = `rotate(${el.dataset.rotation}deg)`;
                el.style.zIndex = Array.from(handEl.children).indexOf(el); // Restore z-index
            });

            if (!isSelected) {
                // Select this one
                card.classList.add('selected');
                const currentBase = parseFloat(card.dataset.baseTop);
                // Pop up by 30px
                card.style.top = `${currentBase - 30}px`;
                // Scale up slightly and keep rotation (or maybe straighten it? let's keep rotation for natural feel, or maybe straighten to read?)
                // User asked for "popping up". Usually reading text is easier if straight. 
                // But let's stick to "popping up" first to respect the arc.
                card.style.transform = `rotate(${rotate}deg) scale(1.1)`;
                card.style.zIndex = 100; // Bring to front
            }
        });

        handEl.appendChild(card);
    });

    // Deselect on background click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-in-hand')) {
            document.querySelectorAll('.card-in-hand').forEach(el => {
                el.classList.remove('selected');
                el.style.top = `${el.dataset.baseTop}px`;
                el.style.transform = `rotate(${el.dataset.rotation}deg)`;
                // Restore original z-index approx (simplified)
                // Or we just don't reset Z-index too aggressively if not needed, but nice to clean up.
                // Actually we can just leave Z-index as is or reset it.
                // The loop inside card click resets it, so we should do it here too?
                // Since we don't have the index easily here without querying, let's just let the 'selected' class removal handle the Visuals if possible,
                // but z-index was inline.
                el.style.zIndex = '';
            });
        }
    });
}

function createCard(data) {
    const template = document.getElementById('card-template');
    const clone = template.content.cloneNode(true);
    const cardDiv = clone.querySelector('.card');

    cardDiv.classList.add(`type-${data.type}`);
    cardDiv.querySelector('.card-label').textContent = data.name;
    cardDiv.querySelector('.card-symbol').textContent = data.symbol;

    return cardDiv;
}

function renderMyIntel(intel) {
    const container = document.getElementById('my-intel');
    container.innerHTML = '';

    // We render collected intel. 
    // Usually these are displayed as stacks or just counters.
    // User wants "like other players" -> Pips.
    // But since it's me, maybe bigger?

    // Helper to create pips
    const createPips = (count, colorClass) => {
        for (let i = 0; i < count; i++) {
            const pip = document.createElement('div');
            pip.className = `badge-pip ${colorClass} my-pip`;
            container.appendChild(pip);
        }
    };

    createPips(intel.red, 'pip-red');
    createPips(intel.blue, 'pip-blue');
    createPips(intel.black, 'pip-black');
}
