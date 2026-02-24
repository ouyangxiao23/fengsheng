/**
 * Stage rendering — phase bar, prompt, and action buttons.
 */

import { getState } from '../state.js';
import { PHASE_ORDER, getName, colorName } from '../constants.js';

export function renderStage() {
    const st = getState();
    const g = st.game;
    const myId = st.myId;

    // Phase bar — use phase-node
    const nodes = document.querySelectorAll('.phase-node');
    const activeIdx = PHASE_ORDER.indexOf(g.phase);
    nodes.forEach((node, i) => {
        node.classList.remove('phase-active', 'phase-done');
        if (i === activeIdx) node.classList.add('phase-active');
        else if (i < activeIdx) node.classList.add('phase-done');
    });

    // Phase progress line
    const phaseLine = document.querySelector('.phase-line');
    if (phaseLine && nodes.length > 0) {
        const progress = activeIdx >= 0 ? (activeIdx / (PHASE_ORDER.length - 1)) * 100 : 0;
        phaseLine.style.setProperty('--phase-progress', progress + '%');
    }

    const prompt = document.getElementById('stage-prompt');
    const btns = document.getElementById('stage-buttons');
    const intelSlot = document.getElementById('intel-card-slot');
    const actionBar = document.getElementById('action-bar');

    prompt.textContent = '';
    btns.innerHTML = '';
    if (intelSlot) intelSlot.innerHTML = '';

    const isMyTurn = g.currentPlayer === myId;

    // Phase-specific rendering
    switch (g.phase) {
        case 'draw':
            prompt.textContent = isMyTurn ? '正在摸牌...' : `${getName(g.currentPlayer)} 摸牌中`;
            break;

        case 'action': {
            const targetMode = st.ui.targetMode;
            if (targetMode === 'coerce_type') {
                // Coerce step 2: pick card type
                prompt.textContent = '选择要威逼的牌类型';
                btns.innerHTML = `
                    <button class="btn btn-sm btn-secondary" data-coerce-type="intercept">截获</button>
                    <button class="btn btn-sm btn-secondary" data-coerce-type="switch">调包</button>
                    <button class="btn btn-sm btn-secondary" data-coerce-type="clarify">澄清</button>
                    <button class="btn btn-sm btn-secondary" data-coerce-type="decoy">误导</button>
                `;
            } else if (targetMode === 'clarify_pick') {
                // Clarify step 2: pick which intel to remove
                const intelCards = st.ui.pendingExtra?.intelCards || [];
                prompt.textContent = '选择要移除的情报';
                btns.innerHTML = intelCards.map(c =>
                    `<button class="btn btn-sm intel-pick-btn intel-pick-${c.intel_color}" data-intel-card-id="${c.id}">${colorName(c.intel_color)}</button>`
                ).join('');
            } else if (targetMode === 'coerce_give') {
                // Target must choose a card to give
                const cardType = st.ui.pendingExtra?.cardType || '';
                const typeNames = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };
                prompt.textContent = `选择一张${typeNames[cardType] || cardType}牌交出`;
            } else if (targetMode === 'probe') {
                prompt.textContent = '选择要探查的目标玩家';
            } else if (targetMode === 'coerce') {
                prompt.textContent = '选择要威逼的目标玩家';
            } else if (targetMode === 'clarify') {
                prompt.textContent = '选择要澄清的目标玩家';
            } else if (g.coercePending) {
                // Observer view: coerce is happening between two other players
                const typeNames = { intercept: '截获', switch: '调包', clarify: '澄清', decoy: '误导' };
                const typeName = typeNames[g.coercePending.cardType] || '';
                prompt.textContent = `${getName(g.coercePending.coercer)} 正在威逼 ${getName(g.coercePending.target)} 交出${typeName}牌`;
            } else if (isMyTurn) {
                prompt.textContent = '选择手牌使用或点击完成';
                btns.innerHTML = `<button class="btn btn-accent btn-sm" id="btn-action-done">完成出牌</button>`;
            } else {
                prompt.textContent = `${getName(g.currentPlayer)} 出牌中...`;
            }
            break;
        }

        case 'transmission':
            if (g.intel.active) {
                // Card lives on the table next to the facing player — not in the stage slot
                const facingName = getName(g.intel.facing);
                const targetName = getName(g.intel.target);
                const dir = g.intel.direction === 'left' ? '←左' : g.intel.direction === 'right' ? '→右' : '↑直达';
                prompt.textContent = `情报(${dir})发往 ${targetName}，在 ${facingName} 面前`;

                if (g.intel.facing === myId) {
                    const isTarget = g.intel.target === myId;
                    const locked = g.intel.isLocked && g.intel.lockTarget === myId;
                    if (isTarget && locked) {
                        prompt.textContent = '你被锁定，必须接收情报';
                    } else if (isTarget) {
                        btns.innerHTML = `
                            <button class="btn btn-accent btn-sm" id="btn-accept">接收</button>
                            <button class="btn btn-secondary btn-sm" id="btn-pass">拒绝</button>
                        `;
                    } else {
                        btns.innerHTML = `
                            <button class="btn btn-accent btn-sm" id="btn-accept">接收</button>
                            <button class="btn btn-secondary btn-sm" id="btn-pass">传递</button>
                        `;
                    }
                }
            } else if (st.ui.targetMode === 'transmit_lock') {
                const targetName = getName(st.ui.pendingExtra?.targetId);
                prompt.textContent = `传递给 ${targetName}，是否锁定？`;
                btns.innerHTML = `
                    <button class="btn btn-accent btn-sm" data-lock-choice="1">锁定</button>
                    <button class="btn btn-secondary btn-sm" data-lock-choice="0">不锁定</button>
                `;
            } else if (st.ui.targetMode === 'transmit_target') {
                prompt.textContent = '选择情报传递目标';
                const alivePlayers = g.turnOrder.filter(pid =>
                    pid !== myId && g.players[pid]?.alive
                );
                btns.innerHTML = alivePlayers.map(pid =>
                    `<button class="btn btn-sm btn-secondary" data-transmit-target="${pid}">${g.playerNames[pid]}</button>`
                ).join('');
            } else if (isMyTurn) {
                prompt.textContent = '选择一张手牌作为情报传出';
            } else {
                prompt.textContent = `${getName(g.currentPlayer)} 正在选择情报...`;
            }
            break;

        case 'contention': {
            const ct = g.contention;
            if (ct.pendingEffect === 'decoy' && ct.pendingPlayer === myId) {
                prompt.textContent = '选择误导方向';
                btns.innerHTML = `
                    <button class="btn btn-sm btn-secondary" data-decoy-direction="left">← 左</button>
                    <button class="btn btn-sm btn-secondary" data-decoy-direction="right">→ 右</button>
                `;
            } else if (ct.pendingEffect === 'decoy') {
                prompt.textContent = `${getName(ct.pendingPlayer)} 选择误导方向中...`;
            } else if (ct.active) {
                const receiverName = getName(g.intel.acceptedBy);
                prompt.textContent = `${receiverName} 将接收情报`;
            } else {
                prompt.textContent = '争夺结束';
            }
            break;
        }

        case 'reception':
            prompt.textContent = '接收阶段';
            break;

        case 'dying': {
            const dyingName = getName(g.dying.player);
            prompt.textContent = `${dyingName} 濒死！`;

            if (g.dying.askingPlayer === myId) {
                prompt.textContent = `${dyingName} 濒死！是否使用澄清？`;
                btns.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-rescue-pass">放弃</button>`;
            } else if (g.dying.askingPlayer) {
                prompt.textContent += ` (${getName(g.dying.askingPlayer)} 决定中)`;
            }
            break;
        }

        case 'death_gift':
            prompt.textContent = '遗赠阶段';
            break;

        case 'game_over':
            prompt.textContent = '游戏结束';
            break;
    }

    // Show/hide action-bar based on whether there's anything to display
    if (actionBar) {
        const hasContent = prompt.textContent.trim() || btns.innerHTML.trim();
        actionBar.style.display = hasContent ? 'flex' : 'none';
    }

    // Active state: prompt is highlighted when player needs to act
    const hasButtons = btns.innerHTML.trim().length > 0;
    const isTargeting = !!st.ui.targetMode;
    prompt.classList.toggle('prompt-active', hasButtons || isTargeting);
}
