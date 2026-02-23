/**
 * Shared constants and pure helpers.
 */

import { getState } from './state.js';

export const IDENTITY_NAMES = {
    resistance: '潜伏战线',
    agency: '特工机关',
};

export const IDENTITY_COLORS = {
    resistance: 'var(--color-red)',
    agency: 'var(--color-blue)',
};

export const PHASE_ORDER = ['draw', 'action', 'transmission', 'contention', 'reception'];

export function getName(pid) {
    if (!pid) return '???';
    const st = getState();
    if (pid === st.myId) return '你';
    return st.game.playerNames[pid] || pid;
}

export function colorName(c) {
    return c === 'red' ? '红色' : c === 'blue' ? '蓝色' : '黑色';
}
