/**
 * Lobby screen rendering and events.
 */

import { getState, update, getOrCreateUserId } from './state.js';
import { connectWebSocket, send } from './ws.js';

export function initLobby() {
    const btnCreate = document.getElementById('btn-create-room');
    const btnJoin = document.getElementById('btn-join-room');
    const btnStart = document.getElementById('btn-start-game');
    const nameInput = document.getElementById('player-name');
    const codeInput = document.getElementById('room-code-input');

    fetchLanInfo();

    btnCreate.addEventListener('click', () => {
        const name = nameInput.value.trim() || '特工';
        const roomId = generateRoomCode();
        joinRoom(name, roomId);
    });

    btnJoin.addEventListener('click', () => {
        const name = nameInput.value.trim() || '特工';
        const code = codeInput.value.trim().toUpperCase();
        if (!code) return;
        joinRoom(name, code);
    });

    btnStart.addEventListener('click', () => {
        send({ type: 'start_game' });
    });

    // Check URL for room
    const path = location.pathname;
    const match = path.match(/^\/room\/([A-Za-z0-9]+)/);
    if (match) {
        const roomId = match[1].toUpperCase();
        const name = nameInput.value.trim() || localStorage.getItem('fengsheng_name') || '特工';
        joinRoom(name, roomId);
    }
}

function joinRoom(name, roomId) {
    const uid = getOrCreateUserId();
    update('myId', uid);
    update('myName', name);
    update('roomId', roomId);
    localStorage.setItem('fengsheng_name', name);

    // Update URL
    history.replaceState(null, '', `/room/${roomId}`);

    connectWebSocket(roomId);
}

export function renderLobby(state) {
    const lobby = state.lobby;
    const roomSection = document.getElementById('lobby-room');
    const roomLabel = document.getElementById('room-id-label');
    const countLabel = document.getElementById('player-count-label');
    const playerList = document.getElementById('lobby-player-list');
    const btnStart = document.getElementById('btn-start-game');

    if (!state.roomId) {
        roomSection.classList.add('hidden');
        return;
    }

    roomSection.classList.remove('hidden');
    roomLabel.textContent = state.roomId;
    countLabel.textContent = `${lobby.players.length} 人`;

    playerList.innerHTML = '';
    for (const p of lobby.players) {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerHTML = `<span>${p.name}</span>`;
        if (p.is_host) {
            div.innerHTML += `<span class="host-badge">房主</span>`;
        }
        playerList.appendChild(div);
    }

    if (lobby.canStart) {
        btnStart.classList.remove('hidden');
    } else {
        btnStart.classList.add('hidden');
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

async function fetchLanInfo() {
    const el = document.getElementById('lan-info');
    if (!el) return;
    try {
        const res = await fetch('/api/host-info');
        const info = await res.json();
        const addr = info.port === 80
            ? `http://${info.ip}`
            : `http://${info.ip}:${info.port}`;
        el.innerHTML =
            `局域网多人游戏 — 同一网络下的玩家访问:` +
            `<span class="lan-addr">${addr}</span>`;
    } catch {
        el.classList.add('hidden');
    }
}
