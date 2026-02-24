/**
 * Overlay UI — hand reveal, probe result, game over, gift selection.
 */

import { getState, update } from '../state.js';
import { IDENTITY_NAMES, getName, colorName } from '../constants.js';

export function showHandReveal(targetId, cards) {
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

export function showProbeResult(targetId, identity) {
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

export function handleGameOver(data) {
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

export function renderGiftUI(data) {
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
