/**
 * Intel transmission message handlers: intel_transmitted, intel_moved,
 * intel_accepted, intel_received.
 */

import { getState, update, addLog } from '../state.js';
import { getName, colorName } from '../constants.js';
import { hand, intel } from '../cardZones.js';
import { renderAll, renderHand, renderStage, renderTable } from '../render/index.js';
import { removeIntelCard, animateIntelAlongArc, animateIntelReveal, animateCardFromHand } from '../animations.js';

export function handleIntelMessage(data) {
    switch (data.type) {
        case 'intel_transmitted': {
            const senderId = data.sender_id;
            const facingId = data.facing;
            update('game.intel', {
                active: true,
                sender: senderId,
                direction: data.direction,
                facing: facingId,
                target: data.target,
                isLocked: data.is_locked,
                lockTarget: data.is_locked ? data.target : null,
                acceptedBy: null,
            });
            const dirLabel = data.direction === 'left' ? '←左' : data.direction === 'right' ? '→右' : '↑直达';
            addLog(`${getName(senderId)} 传出了情报(${dirLabel}) → ${getName(data.target)}`);

            if (senderId === getState().myId) {
                // Grab card rect before removing it from the DOM
                const txCardId = getState().ui.transmittedCardId;
                const cardEl = txCardId
                    ? document.querySelector(`.hand-card-wrap[data-card-id="${txCardId}"]`)
                    : null;
                const cardRect = cardEl ? cardEl.getBoundingClientRect() : null;

                // Card leaves hand → enters table zone
                if (txCardId) {
                    hand.take(txCardId);
                    update('ui.transmittedCardId', null);
                    renderHand();
                }

                animateCardFromHand(cardRect, senderId, () => {
                    animateIntelAlongArc(senderId, facingId, () => {
                        renderStage();
                        renderTable();
                    }, data.direction);
                });
            } else {
                animateIntelAlongArc(senderId, facingId, () => {
                    renderStage();
                    renderTable();
                }, data.direction);
            }
            break;
        }

        case 'intel_moved': {
            const oldFacing = getState().game.intel.facing;
            const newFacing = data.to_player;
            const dir = getState().game.intel.direction;
            update('game.intel.facing', newFacing);
            addLog(`情报传到 ${getName(newFacing)} 面前`);
            animateIntelAlongArc(oldFacing, newFacing, () => {
                renderStage();
                renderTable();
            }, dir);
            break;
        }

        case 'intel_accepted':
            update('game.intel.acceptedBy', data.player_id);
            addLog(`${getName(data.player_id)} 宣布接收情报`);
            renderStage();
            break;

        case 'intel_received': {
            // Card leaves table zone → enters player's intel zone
            intel.add(data.player_id, data.card);
            update('game.intel', { active: false, sender: null, direction: null, facing: null, target: null, isLocked: false, lockTarget: null, acceptedBy: null });
            addLog(`${getName(data.player_id)} 接收了 ${colorName(data.card.intel_color)} 情报`);
            removeIntelCard();
            animateIntelReveal(data.card.intel_color, data.player_id, () => {
                renderAll();
            });
            break;
        }
    }
}
