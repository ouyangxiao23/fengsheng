"""Intel transmission tracking for 绝密行动 (Secret Mission).

Manages the lifecycle of an intel card from transmission through reception.
State: intel_card, intel_direction, intel_sender, intel_facing, intel_target,
       intel_locked, intel_accepted_by.
"""


class IntelTracker:
    def __init__(self, game):
        self.game = game
        self.intel_card = None
        self.intel_direction = None   # 'left' | 'right' | 'straight'
        self.intel_sender = None
        self.intel_facing = None      # player the intel is currently in front of
        self.intel_target = None      # designated recipient
        self.intel_locked = None      # target player if card has_lock (or None)
        self.intel_accepted_by = None

    def reset(self):
        """Clear all intel transmission state."""
        self.intel_card = None
        self.intel_direction = None
        self.intel_sender = None
        self.intel_facing = None
        self.intel_target = None
        self.intel_locked = None
        self.intel_accepted_by = None

    def transmit(self, player_id, card_id, target=None, lock=None):
        """Player sends a card as intel to a designated target."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.TRANSMISSION:
            return [game._error(player_id, '当前不是传递阶段')]
        if player_id != game.current_player_id():
            return [game._error(player_id, '不是你的回合')]

        ps = game.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [game._error(player_id, '你没有这张牌')]

        if not target or target not in game.players:
            return [game._error(player_id, '请选择情报传递目标')]
        if target == player_id:
            return [game._error(player_id, '不能选择自己作为目标')]
        if not game.players[target].alive:
            return [game._error(player_id, '目标玩家已死亡')]

        card_dir = card['direction']
        is_locked = bool(lock) and card['has_lock']

        ps.remove_hand_card(card_id)
        self.intel_card = card
        self.intel_direction = card_dir
        self.intel_sender = player_id
        self.intel_target = target
        self.intel_locked = target if is_locked else None
        self.intel_accepted_by = None

        events = []
        events.extend(game._hand_count_events())

        if card_dir == 'straight':
            self.intel_facing = target
            events.append({
                'target': 'all',
                'msg': {
                    'type': 'intel_transmitted',
                    'sender_id': player_id,
                    'direction': card_dir,
                    'target': target,
                    'is_locked': is_locked,
                    'facing': target,
                }
            })
            if is_locked:
                return events + self.force_accept(target)
            return events
        else:
            next_player = game._next_alive_player(player_id, card_dir)
            self.intel_facing = next_player
            events.append({
                'target': 'all',
                'msg': {
                    'type': 'intel_transmitted',
                    'sender_id': player_id,
                    'direction': card_dir,
                    'target': target,
                    'is_locked': is_locked,
                    'facing': next_player,
                }
            })
            if next_player == target and is_locked:
                return events + self.force_accept(next_player)
            return events

    def accept(self, player_id):
        """Player accepts the intel facing them."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.TRANSMISSION:
            return [game._error(player_id, '当前不是传递阶段')]
        if player_id != self.intel_facing:
            return [game._error(player_id, '情报不在你面前')]

        self.intel_accepted_by = player_id
        events = [{
            'target': 'all',
            'msg': {'type': 'intel_accepted', 'player_id': player_id}
        }]

        events.extend(game.contention_mgr.start())
        return events

    def pass_intel(self, player_id):
        """Player passes/refuses intel."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.TRANSMISSION:
            return [game._error(player_id, '当前不是传递阶段')]
        if player_id != self.intel_facing:
            return [game._error(player_id, '情报不在你面前')]
        if self.intel_locked and player_id == self.intel_locked:
            return [game._error(player_id, '你被锁定，必须接收')]

        if player_id == self.intel_target:
            self.intel_facing = self.intel_sender
            events = [{
                'target': 'all',
                'msg': {'type': 'intel_moved', 'from_player': player_id, 'to_player': self.intel_sender}
            }]
            return events + self.force_accept(self.intel_sender)

        next_player = game._next_alive_player(player_id, self.intel_direction)
        self.intel_facing = next_player
        events = [{
            'target': 'all',
            'msg': {'type': 'intel_moved', 'from_player': player_id, 'to_player': next_player}
        }]

        if next_player == self.intel_target:
            if self.intel_locked:
                return events + self.force_accept(next_player)
            return events

        return events

    def force_accept(self, player_id):
        """Force a player to accept intel (locked or returned to sender)."""
        game = self.game
        self.intel_accepted_by = player_id
        events = [{
            'target': 'all',
            'msg': {'type': 'intel_accepted', 'player_id': player_id}
        }]
        events.extend(game.contention_mgr.start())
        return events

    def get_state(self):
        """Return dict for serialization."""
        return {
            'active': self.intel_card is not None or self.intel_accepted_by is not None,
            'sender': self.intel_sender,
            'direction': self.intel_direction,
            'facing': self.intel_facing,
            'target': self.intel_target,
            'is_locked': self.intel_locked is not None,
            'lock_target': self.intel_locked,
            'accepted_by': self.intel_accepted_by,
        }
