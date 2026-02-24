/**
 * Client state store with pub/sub.
 */

const state = {
    screen: 'lobby',
    roomId: null,
    myId: null,
    myName: null,

    // Lobby
    lobby: { players: [], canStart: false, isHost: false },

    // Game
    game: {
        started: false,
        myIdentity: null,
        phase: 'waiting',
        currentPlayer: null,
        turnOrder: [],
        playerNames: {},
        players: {},       // pid -> { handCount, intelArea: [{intel_color}], alive }
        myHand: [],
        myIntel: [],

        intel: {
            active: false,
            sender: null,
            direction: null,
            facing: null,
            target: null,
            isLocked: false,
            lockTarget: null,
            acceptedBy: null,
        },

        contention: {
            active: false,
            timerSeconds: 0,
            timerPaused: false,
            pendingEffect: null,    // 'decoy' | null
            pendingPlayer: null,
        },
        dying: { active: false, player: null, askingPlayer: null },
        coercePending: null,  // { coercer, target, cardType } when coerce is in progress

        log: [],
    },

    // UI (local only)
    ui: {
        selectedCardId: null,
        targetMode: null,       // null | 'probe' | 'coerce' | 'coerce_type' | 'coerce_give' | 'clarify' | 'clarify_pick' | 'transmit_target' | 'gift'
        pendingAction: null,    // card awaiting target selection
        pendingExtra: null,     // {targetId, cardType, intelCards, matchingIds} for multi-step flows
        transmittedCardId: null, // card ID being transmitted (for hand removal on confirmation)
        giftCards: [],          // selected card IDs for death gift
        giftRecipient: null,
    },
};

const listeners = new Set();

export function getState() { return state; }

export function update(path, value) {
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    notify();
}

export function mergeGame(partial) {
    Object.assign(state.game, partial);
    notify();
}

export function subscribe(fn) { listeners.add(fn); }
export function unsubscribe(fn) { listeners.delete(fn); }

function notify() {
    for (const fn of listeners) {
        try { fn(state); } catch (e) { console.error('State listener error:', e); }
    }
}

export function addLog(msg) {
    state.game.log.push(msg);
    if (state.game.log.length > 100) state.game.log.shift();
}

export function getOrCreateUserId() {
    let id = localStorage.getItem('fengsheng_uid');
    if (!id) {
        id = 'u_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('fengsheng_uid', id);
    }
    return id;
}
