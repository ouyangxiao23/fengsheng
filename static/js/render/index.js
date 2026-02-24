/**
 * Render facade — re-exports sub-renderers and keeps small helpers.
 */

import { getState } from '../state.js';
import { IDENTITY_NAMES, IDENTITY_COLORS } from '../constants.js';
import { renderTable } from './renderTable.js';
import { renderStage } from './renderStage.js';
import { renderHand } from './renderHand.js';

export { renderTable, getAvatarPagePosition, getSelfPosition } from './renderTable.js';
export { renderStage } from './renderStage.js';
export { renderHand, updateHandSelection, createCardElement, resetSeenCards } from './renderHand.js';

// ── Composite Render ────────────────────────────────────────

export function renderAll() {
    renderRibbon();
    renderTable();
    renderStage();
    renderMyIntel();
    renderHand();
}

// ── ResizeObserver — re-render zones when their pixel size changes ──────────
// Track rendered-at dimensions to prevent feedback loops:
// render() rebuilds DOM → observer fires → but size is unchanged → skip.
let _resizeInstalled = false;
let _renderedTableW = -1, _renderedTableH = -1;
let _renderedHandW = -1, _renderedHandH = -1;

export function installResizeObservers() {
    if (_resizeInstalled) return;
    _resizeInstalled = true;

    const tableArea = document.getElementById('table-area');
    const handArea  = document.getElementById('my-hand');

    if (typeof ResizeObserver !== 'undefined') {
        let tableTimer = null, handTimer = null;

        new ResizeObserver(() => {
            const w = tableArea.clientWidth;
            const h = tableArea.clientHeight;
            if (w === _renderedTableW && h === _renderedTableH) return;
            clearTimeout(tableTimer);
            tableTimer = setTimeout(() => {
                _renderedTableW = tableArea.clientWidth;
                _renderedTableH = tableArea.clientHeight;
                renderTable();
            }, 50);
        }).observe(tableArea);

        new ResizeObserver(() => {
            const w = handArea.clientWidth;
            const h = handArea.clientHeight;
            if (w === _renderedHandW && h === _renderedHandH) return;
            clearTimeout(handTimer);
            handTimer = setTimeout(() => {
                _renderedHandW = handArea.clientWidth;
                _renderedHandH = handArea.clientHeight;
                renderHand();
            }, 50);
        }).observe(handArea);
    }

    // Fallback for older browsers
    window.addEventListener('resize', () => {
        renderTable();
        renderHand();
    });
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
