/**
 * Lifecycle message handlers: dying, rescue_ask, player_saved, player_died,
 * player_eliminated, death_gift_prompt, death_gift_received, death_gift_given,
 * game_over, player_disconnected.
 */

import { getState, update, addLog } from '../state.js';
import { getName, colorName } from '../constants.js';
import { hand, intel, players } from '../cardZones.js';
import { renderAll, renderHand, renderStage } from '../render/index.js';
import { handleGameOver, renderGiftUI } from '../ui/overlays.js';

export function handleLifecycleMessage(data) {
    switch (data.type) {
        case 'dying':
            update('game.dying', { active: true, player: data.player_id, askingPlayer: null });
            addLog(`${getName(data.player_id)} 濒死！`);
            renderStage();
            break;

        case 'rescue_ask':
            update('game.dying.askingPlayer', data.player_id);
            renderStage();
            renderHand();
            break;

        case 'player_saved':
            addLog(`${getName(data.savior_id)} 用澄清救了 ${getName(data.player_id)}`);
            // Intel leaves player's intel zone (clarify destroys it)
            if (data.removed_intel?.id) {
                intel.removeById(data.player_id, data.removed_intel.id);
            } else {
                intel.remove(data.player_id, data.removed_intel?.intel_color || 'black');
            }
            renderAll();
            break;

        case 'player_died':
            players.kill(data.player_id);
            addLog(`${getName(data.player_id)} 死亡`);
            renderAll();
            break;

        case 'player_eliminated':
            players.kill(data.player_id);
            addLog(`${getName(data.player_id)} 因无牌传递被淘汰`);
            renderAll();
            break;

        case 'death_gift_prompt':
            update('ui.targetMode', 'gift');
            update('ui.giftCards', []);
            update('ui.giftRecipient', null);
            renderGiftUI(data);
            break;

        case 'death_gift_received':
            if (data.cards) {
                hand.add(...data.cards);
                addLog(`你收到了 ${getName(data.from_player)} 的${data.cards.length}张遗赠`);
                renderHand();
            }
            break;

        case 'death_gift_given':
            addLog(`${getName(data.from_player)} 赠送了${data.count}张牌给 ${getName(data.to_player)}`);
            break;

        case 'game_over':
            handleGameOver(data);
            break;

        case 'player_disconnected':
            addLog(`${getName(data.player_id)} 断线`);
            break;
    }
}
