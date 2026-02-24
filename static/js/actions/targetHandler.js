/**
 * Target selection and transmission target picker.
 */

import { getState, update } from '../state.js';
import { send } from '../ws.js';
import { renderStage, updateHandSelection } from '../render/index.js';

export function handleTargetSelect(targetId, st) {
    const mode = st.ui.targetMode;
    const card = st.ui.pendingAction;

    if (!card) {
        update('ui.targetMode', null);
        return;
    }

    if (mode === 'probe') {
        send({ type: 'action_play_card', card_id: card.id, target_id: targetId });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingAction', null);
        updateHandSelection();
        renderStage();
        return;
    }

    if (mode === 'coerce') {
        // Coerce step 2: show card type picker
        update('ui.targetMode', 'coerce_type');
        update('ui.pendingExtra', { targetId });
        renderStage();
        return;
    }

    if (mode === 'clarify') {
        // Clarify step 2: show intel card picker for target
        const g = st.game;
        const targetPlayer = g.players[targetId];
        if (!targetPlayer || targetPlayer.intelArea.length === 0) {
            update('ui.targetMode', null);
            update('ui.pendingAction', null);
            update('ui.selectedCardId', null);
            updateHandSelection();
            renderStage();
            return;
        }
        update('ui.targetMode', 'clarify_pick');
        update('ui.pendingExtra', {
            targetId,
            intelCards: targetPlayer.intelArea,
        });
        renderStage();
        return;
    }

    if (mode === 'transmit_target') {
        if (card.has_lock) {
            // Lockable card: ask player whether to lock
            update('ui.targetMode', 'transmit_lock');
            update('ui.pendingExtra', { targetId });
            renderStage();
            return;
        }
        update('ui.transmittedCardId', card.id);
        send({
            type: 'transmit_card',
            card_id: card.id,
            target: targetId,
            lock: false,
        });
        update('ui.selectedCardId', null);
        update('ui.targetMode', null);
        update('ui.pendingAction', null);
        update('ui.pendingExtra', null);
        updateHandSelection();
        renderStage();
        return;
    }
}

export function showTargetPicker(card) {
    update('ui.pendingAction', card);
    update('ui.targetMode', 'transmit_target');
    renderStage();
}
