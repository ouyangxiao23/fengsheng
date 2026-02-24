/**
 * Combat message handlers: card_played, action_effect, coerce_choose,
 * coerce_waiting, coerce_pending.
 */

import { getState, update, addLog } from '../state.js';
import { IDENTITY_NAMES, getName, colorName } from '../constants.js';
import { hand, intel } from '../cardZones.js';
import { renderAll, renderHand, renderStage, createCardElement } from '../render/index.js';
import { showPlayedCard } from '../animations.js';
import { showHandReveal, showProbeResult } from '../ui/overlays.js';

export function handleCombatMessage(data) {
    switch (data.type) {
        case 'card_played': {
            const who = getName(data.player_id);
            if (data.card) {
                addLog(`${who} 使用了 ${data.card.action_name}`);
                // Show the card face-up near the player's avatar
                showPlayedCard(data.player_id, createCardElement(data.card));
            } else {
                addLog(`${who} 使用了 ${data.action_name || '一张牌'}（暗置）`);
                // Show a card-back near the player's avatar
                const back = document.createElement('div');
                back.className = 'card-back';
                showPlayedCard(data.player_id, back);
            }
            if (data.player_id === getState().myId && data.card) {
                hand.take(data.card.id);
                renderHand();
            }
            break;
        }

        case 'action_effect':
            handleActionEffect(data);
            break;

        case 'coerce_choose': {
            // I'm the target — must choose a card to give
            const typeNames = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };
            addLog(`${getName(data.coercer_id)} 威逼你交出${typeNames[data.card_type] || ''}牌`);
            update('game.coercePending', {
                coercer: data.coercer_id,
                target: getState().myId,
                cardType: data.card_type,
            });
            update('ui.targetMode', 'coerce_give');
            update('ui.pendingExtra', {
                coercerId: data.coercer_id,
                cardType: data.card_type,
                matchingIds: data.matching_ids,
            });
            renderStage();
            renderHand();
            break;
        }

        case 'coerce_waiting': {
            addLog(`等待 ${getName(data.target_id)} 回应威逼...`);
            update('game.coercePending', {
                coercer: getState().myId,
                target: data.target_id,
                cardType: data.card_type,
            });
            renderStage();
            break;
        }

        case 'coerce_pending': {
            const typeNames2 = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };
            addLog(`${getName(data.coercer_id)} 正在威逼 ${getName(data.target_id)} 交出${typeNames2[data.card_type] || ''}牌`);
            update('game.coercePending', {
                coercer: data.coercer_id,
                target: data.target_id,
                cardType: data.card_type,
            });
            renderStage();
            break;
        }
    }
}

// ── Action Effects ─────────────────────────────────────────

function handleActionEffect(data) {
    const typeNames = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };

    // Clear coerce pending state on any coerce resolution
    const coerceEffects = ['coerce_gave', 'coerce_lost', 'coerce_reveal', 'coerce_revealed', 'coerce_no_match'];
    if (coerceEffects.includes(data.effect)) {
        update('game.coercePending', null);
    }

    switch (data.effect) {
        case 'probe':
            addLog(`你查看了 ${getName(data.target_id)} 的身份: ${IDENTITY_NAMES[data.identity]}`);
            showProbeResult(data.target_id, data.identity);
            break;
        case 'coerce_gave':
            if (data.card) {
                // I'm the coercer — card arrives in my hand
                addLog(`${getName(data.target_id)} 交出了一张${typeNames[data.card_type] || ''}牌`);
                hand.add(data.card);
                renderHand();
            } else {
                // Observer view
                addLog(`${getName(data.target_id)} 被威逼，交出了一张${typeNames[data.card_type] || ''}牌`);
            }
            renderStage();
            break;
        case 'coerce_lost': {
            // I'm the target — card leaves my hand
            addLog(`你被 ${getName(data.coercer_id)} 威逼，交出了一张${typeNames[data.card_type] || ''}牌`);
            hand.take(data.card.id);
            update('ui.targetMode', null);
            update('ui.pendingExtra', null);
            renderHand();
            renderStage();
            break;
        }
        case 'coerce_reveal': {
            // I'm the coercer — target has no matching cards, see their hand
            addLog(`${getName(data.target_id)} 没有符合要求的牌，展示手牌`);
            showHandReveal(data.target_id, data.hand);
            renderStage();
            break;
        }
        case 'coerce_revealed': {
            // I'm the target — my hand was revealed
            addLog(`你没有${typeNames[data.card_type] || ''}牌，手牌被展示给 ${getName(data.coercer_id)}`);
            renderStage();
            break;
        }
        case 'coerce_no_match': {
            // Observer view
            addLog(`${getName(data.target_id)} 没有${typeNames[data.card_type] || ''}牌，手牌被展示`);
            renderStage();
            break;
        }
        case 'clarify': {
            const color = colorName(data.removed_intel?.intel_color || 'black');
            addLog(`${getName(data.player_id)} 对 ${getName(data.target_id)} 使用了澄清，移除${color}情报`);
            if (data.removed_intel?.id) {
                intel.removeById(data.target_id, data.removed_intel.id);
            } else {
                intel.remove(data.target_id, data.removed_intel?.intel_color || 'black');
            }
            renderAll();
            break;
        }
    }
}
