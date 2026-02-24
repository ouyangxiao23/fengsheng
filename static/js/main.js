/**
 * Entry point — initialize app, route screens.
 */

import { getState, update, subscribe, getOrCreateUserId } from './state.js';
import { initLobby, renderLobby } from './lobby.js';
import { renderAll, installResizeObservers } from './render.js';
import { bindActions } from './actions.js';

document.addEventListener('DOMContentLoaded', () => {
    // Set user ID
    const uid = getOrCreateUserId();
    update('myId', uid);

    // Restore name
    const savedName = localStorage.getItem('fengsheng_name');
    if (savedName) {
        update('myName', savedName);
        document.getElementById('player-name').value = savedName;
    }

    // Init lobby
    initLobby();

    // Bind game actions
    bindActions();

    // Subscribe to state changes for re-render
    subscribe((state) => {
        if (state.game.started && document.body.className !== 'screen-game') {
            document.body.className = 'screen-game';
            renderAll();
            installResizeObservers();
        }
    });
});
