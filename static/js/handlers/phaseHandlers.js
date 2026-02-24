/**
 * Phase-related message handlers: room_state, game_start, deal_hand,
 * phase_change, draw_cards, hand_count_update.
 */

import { getState, update, mergeGame, addLog } from '../state.js';
import { IDENTITY_NAMES, getName } from '../constants.js';
import { hand, players } from '../cardZones.js';
import { renderLobby } from '../lobby.js';
import { renderAll, renderHand, renderStage, renderTable } from '../render/index.js';
import { removeIntelCard } from '../animations.js';
import { stopContentionCountdown, renderContentionTimer } from './contentionHandlers.js';

export function handlePhaseMessage(data) {
    const st = getState();

    switch (data.type) {
        case 'room_state':
            update('roomId', data.room_id);
            update('lobby', {
                players: data.players,
                canStart: data.can_start,
                isHost: data.is_host,
            });
            renderLobby(st);
            break;

        case 'game_start': {
            mergeGame({
                started: true,
                myIdentity: data.your_identity,
                turnOrder: data.turn_order,
                playerNames: data.player_names,
            });
            const initPlayers = {};
            for (const pid of data.turn_order) {
                initPlayers[pid] = { handCount: 0, intelArea: [], alive: true };
            }
            update('game.players', initPlayers);
            document.body.className = 'screen-game';
            renderAll();
            addLog(`游戏开始！你的身份：${IDENTITY_NAMES[data.your_identity]}`);
            break;
        }

        case 'deal_hand':
            hand.replace(data.cards);
            renderHand();
            break;

        case 'phase_change':
            mergeGame({ phase: data.phase, currentPlayer: data.current_player });
            // Don't reset intel.active when entering contention — intel is still on the table
            if (data.phase !== 'contention') {
                update('game.intel.active', false);
                stopContentionCountdown();
                update('game.contention', {
                    active: false,
                    timerSeconds: 0,
                    timerPaused: false,
                    pendingEffect: null,
                    pendingPlayer: null,
                });
                renderContentionTimer();
            }
            if (data.phase === 'dying') {
                // keep dying state
            } else {
                update('game.dying', { active: false, player: null, askingPlayer: null });
            }
            update('game.coercePending', null);
            update('ui.selectedCardId', null);
            update('ui.targetMode', null);
            update('ui.pendingExtra', null);
            if (data.phase === 'draw') removeIntelCard();
            // Skip render for contention — contention_start will handle it
            if (data.phase !== 'contention') {
                renderStage();
            }
            renderHand();
            renderTable();
            break;

        case 'draw_cards':
            if (data.cards) {
                hand.add(...data.cards);
                addLog(`你摸了${data.cards.length}张牌`);
                renderHand();
            } else {
                addLog(`${getName(data.player_id)} 摸了${data.count}张牌`);
            }
            break;

        case 'hand_count_update':
            players.syncHandCounts(data.counts);
            renderTable();
            break;
    }
}
