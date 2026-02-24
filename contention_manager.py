"""Contention phase management for 绝密行动 (Secret Mission).

Manages the simultaneous contention timer, card plays during contention,
and resolution of intercept/decoy/switch effects.
"""


class ContentionManager:
    def __init__(self, game):
        self.game = game
        self.contention_pending = None            # None | 'decoy_direction'
        self.contention_pending_player = None     # player_id who must make a choice
        self.timer_signal = None                  # read by server.py after each action

    def reset(self):
        """Clear contention state."""
        self.contention_pending = None
        self.contention_pending_player = None
        self.timer_signal = None

    def start(self):
        """Begin simultaneous contention phase with timer."""
        from game_logic import Phase
        game = self.game

        game.phase = Phase.CONTENTION
        self.contention_pending = None
        self.contention_pending_player = None
        self.timer_signal = 'start_timer'
        events = [game._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {
                'type': 'contention_start',
                'receiver': game.intel_tracker.intel_accepted_by,
                'timer_seconds': 7,
            }
        })
        return events

    def play_card(self, player_id, card_id):
        """Player plays a contention-phase card (simultaneous — any alive player)."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.CONTENTION:
            return [game._error(player_id, '当前不是争夺阶段')]
        if self.contention_pending:
            return [game._error(player_id, '正在等待选择，无法出牌')]
        if not game.players[player_id].alive:
            return [game._error(player_id, '你已死亡')]

        ps = game.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [game._error(player_id, '你没有这张牌')]
        if card['action_phase'] != 'contention':
            return [game._error(player_id, '这张牌不能在争夺阶段使用')]

        ps.remove_hand_card(card_id)
        effect = card['action_effect']

        # card_played event — hide switch card color from others
        if effect == 'switch':
            events = [{
                'target': player_id,
                'msg': {'type': 'card_played', 'player_id': player_id, 'card': card}
            }, {
                'target': f'all_except:{player_id}',
                'msg': {'type': 'card_played', 'player_id': player_id, 'card': None,
                        'action_name': card['action_name']}
            }]
        else:
            events = [{
                'target': 'all',
                'msg': {'type': 'card_played', 'player_id': player_id, 'card': card}
            }]

        if effect == 'intercept':
            events.extend(self.resolve_intercept(player_id))
            self.timer_signal = 'reset_timer'
            game.discard.append(card)
        elif effect == 'decoy':
            self.contention_pending = 'decoy_direction'
            self.contention_pending_player = player_id
            self.timer_signal = 'pause_timer'
            events.append({
                'target': 'all',
                'msg': {
                    'type': 'contention_pending',
                    'effect': 'decoy',
                    'player_id': player_id,
                }
            })
            events.append({
                'target': player_id,
                'msg': {'type': 'decoy_choose_direction'}
            })
            game.discard.append(card)
        elif effect == 'switch':
            # Switch card replaces intel; old intel goes to player's hand
            tracker = game.intel_tracker
            old_intel = tracker.intel_card
            tracker.intel_card = card  # switch card becomes new intel
            ps.hand.append(old_intel)  # old intel goes to player's hand
            # No discard — switch card is now the intel
            events.append({
                'target': player_id,
                'msg': {
                    'type': 'contention_result',
                    'effect': 'switch',
                    'player_id': player_id,
                    'new_hand_card': old_intel,
                    'old_intel': old_intel,
                }
            })
            events.append({
                'target': f'all_except:{player_id}',
                'msg': {
                    'type': 'contention_result',
                    'effect': 'switch',
                    'player_id': player_id,
                    'old_intel': old_intel,
                }
            })
            self.timer_signal = 'reset_timer'

        events.extend(game._hand_count_events())
        return events

    def resolve_intercept(self, player_id):
        """Player becomes the new receiver."""
        tracker = self.game.intel_tracker
        old_receiver = tracker.intel_accepted_by
        tracker.intel_accepted_by = player_id
        tracker.intel_facing = player_id
        return [{
            'target': 'all',
            'msg': {
                'type': 'contention_result',
                'effect': 'intercept',
                'player_id': player_id,
                'old_receiver': old_receiver,
            }
        }]

    def resolve_decoy(self, player_id, direction=None):
        """Resolve pending decoy: move intel one seat left or right."""
        game = self.game
        tracker = game.intel_tracker

        if self.contention_pending != 'decoy_direction':
            return [game._error(player_id, '当前没有待处理的误导')]
        if player_id != self.contention_pending_player:
            return [game._error(player_id, '不是你的选择')]
        if direction not in ('left', 'right'):
            return [game._error(player_id, '请选择左或右')]

        old_receiver = tracker.intel_accepted_by
        new_receiver = game._next_alive_player(tracker.intel_accepted_by, direction)
        tracker.intel_accepted_by = new_receiver
        tracker.intel_facing = new_receiver

        self.contention_pending = None
        self.contention_pending_player = None
        self.timer_signal = 'reset_timer'

        return [{
            'target': 'all',
            'msg': {
                'type': 'contention_result',
                'effect': 'decoy',
                'player_id': player_id,
                'direction': direction,
                'old_receiver': old_receiver,
                'new_receiver': new_receiver,
            }
        }]

    def end(self):
        """Called by server when timer expires with no pending choice."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.CONTENTION:
            return []
        if self.contention_pending:
            return []
        self.timer_signal = None
        return game._resolve_reception()
