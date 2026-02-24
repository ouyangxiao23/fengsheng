/**
 * WebSocket connection manager.
 */

import { getState, update, getOrCreateUserId } from './state.js';
import { handleServerMessage } from './messageRouter.js';

let ws = null;
let reconnectTimer = null;

export function connectWebSocket(roomId) {
    if (ws) {
        // Detach handlers before closing so the old socket's onclose
        // doesn't schedule a stale reconnect that kills the new connection.
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
    }
    clearTimeout(reconnectTimer);

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
        const st = getState();
        ws.send(JSON.stringify({
            type: 'enter_room',
            room: roomId,
            id: st.myId,
            name: st.myName || 'Player',
        }));
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        } catch (e) {
            console.error('Message parse error:', e);
        }
    };

    ws.onclose = () => {
        reconnectTimer = setTimeout(() => connectWebSocket(roomId), 2000);
    };

    ws.onerror = () => {}; // onclose will fire after this
}

export function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}
