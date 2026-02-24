"""Rescue/dying management for 绝密行动 (Secret Mission).

Manages the dying → rescue → death → gift → finalize lifecycle.
"""


class RescueManager:
    def __init__(self, game):
        self.game = game
        self.dying_player = None
        self.rescue_order = []
        self.rescue_idx = 0

    def reset(self):
        """Clear dying state."""
        self.dying_player = None
        self.rescue_order = []
        self.rescue_idx = 0

    def start_dying(self, player_id):
        """Begin dying rescue round."""
        from game_logic import Phase
        game = self.game

        game.phase = Phase.DYING
        self.dying_player = player_id

        order = []
        start = game.turn_order.index(game.current_player_id())
        n = len(game.turn_order)
        for i in range(n):
            pid = game.turn_order[(start + i) % n]
            if game.players[pid].alive:
                order.append(pid)
        self.rescue_order = order
        self.rescue_idx = 0

        events = [game._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {'type': 'dying', 'player_id': player_id}
        })
        events.extend(self.ask_rescue())
        return events

    def ask_rescue(self):
        """Ask next player in rescue order to save."""
        if self.rescue_idx >= len(self.rescue_order):
            return self.player_dies(self.dying_player)

        pid = self.rescue_order[self.rescue_idx]
        return [{
            'target': 'all',
            'msg': {'type': 'rescue_ask', 'player_id': pid}
        }]

    def play_clarify(self, player_id, card_id, intel_card_id=None):
        """Play Clarify to save dying player."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.DYING:
            return [game._error(player_id, '当前不是濒死阶段')]
        if player_id != self.rescue_order[self.rescue_idx]:
            return [game._error(player_id, '还没轮到你')]

        ps = game.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [game._error(player_id, '你没有这张牌')]
        if card['action_effect'] != 'clarify':
            return [game._error(player_id, '只能使用澄清牌')]

        dying_ps = game.players[self.dying_player]
        black_cards = [c for c in dying_ps.intel_area if c['intel_color'] == 'black']
        if not black_cards:
            return [game._error(player_id, '没有黑色情报可移除')]

        if intel_card_id:
            removed = None
            for c in black_cards:
                if c['id'] == intel_card_id:
                    removed = c
                    break
            if not removed:
                return [game._error(player_id, '指定的情报不存在')]
        else:
            removed = black_cards[0]
        dying_ps.intel_area.remove(removed)
        game.discard.append(removed)

        ps.remove_hand_card(card_id)
        game.discard.append(card)

        events = [{
            'target': 'all',
            'msg': {
                'type': 'card_played',
                'player_id': player_id,
                'card': card,
            }
        }]
        events.extend(game._hand_count_events())
        events.append({
            'target': 'all',
            'msg': {
                'type': 'player_saved',
                'player_id': self.dying_player,
                'savior_id': player_id,
                'removed_intel': removed,
            }
        })

        if dying_ps.black_count() >= 3:
            self.rescue_idx = 0
            events.extend(self.ask_rescue())
        else:
            self.dying_player = None
            events.extend(game._end_turn())

        return events

    def pass_rescue(self, player_id):
        """Decline to save dying player."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.DYING:
            return [game._error(player_id, '当前不是濒死阶段')]
        if player_id != self.rescue_order[self.rescue_idx]:
            return [game._error(player_id, '还没轮到你')]

        self.rescue_idx += 1
        return self.ask_rescue()

    def player_dies(self, player_id):
        """Player dies. Enter death gift phase."""
        from game_logic import Phase
        game = self.game

        game.phase = Phase.DEATH_GIFT
        ps = game.players[player_id]

        events = [game._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {'type': 'player_died', 'player_id': player_id}
        })

        if len(ps.hand) == 0:
            return events + self.finalize_death(player_id)

        events.append({
            'target': player_id,
            'msg': {
                'type': 'death_gift_prompt',
                'hand': ps.hand[:],
                'max_gifts': min(3, len(ps.hand)),
            }
        })

        return events

    def death_gift(self, player_id, card_ids, recipient_id):
        """Dying player gifts up to 3 cards to one player."""
        from game_logic import Phase
        game = self.game

        if game.phase != Phase.DEATH_GIFT:
            return [game._error(player_id, '当前不是遗赠阶段')]
        if player_id != self.dying_player:
            return [game._error(player_id, '你不在濒死状态')]
        if len(card_ids) > 3:
            return [game._error(player_id, '最多赠送3张牌')]
        if recipient_id and (recipient_id not in game.players or
                             not game.players[recipient_id].alive or
                             recipient_id == player_id):
            return [game._error(player_id, '无效的赠送目标')]

        ps = game.players[player_id]
        events = []

        if recipient_id and card_ids:
            recipient = game.players[recipient_id]
            gifted = []
            for cid in card_ids:
                card = ps.remove_hand_card(cid)
                if card:
                    recipient.hand.append(card)
                    gifted.append(card)

            if gifted:
                events.append({
                    'target': recipient_id,
                    'msg': {
                        'type': 'death_gift_received',
                        'from_player': player_id,
                        'cards': gifted,
                    }
                })
                events.append({
                    'target': 'all',
                    'msg': {
                        'type': 'death_gift_given',
                        'from_player': player_id,
                        'to_player': recipient_id,
                        'count': len(gifted),
                    }
                })

        events.extend(self.finalize_death(player_id))
        return events

    def finalize_death(self, player_id):
        """Remove dead player from game, discard remaining cards."""
        game = self.game
        ps = game.players[player_id]
        ps.alive = False

        game.discard.extend(ps.hand)
        game.discard.extend(ps.intel_area)
        ps.hand.clear()
        ps.intel_area.clear()

        if player_id in game.turn_order:
            dead_idx = game.turn_order.index(player_id)
            game.turn_order.remove(player_id)
            if dead_idx < game.current_turn_idx:
                game.current_turn_idx -= 1
            elif dead_idx == game.current_turn_idx:
                if game.current_turn_idx >= len(game.turn_order):
                    game.current_turn_idx = 0

        self.dying_player = None
        events = game._hand_count_events()

        alive_factions = set(game.players[pid].identity for pid in game.turn_order
                            if game.players[pid].alive)
        if len(alive_factions) <= 1 and len(game.turn_order) > 0:
            faction = alive_factions.pop()
            events.extend(game._game_over(faction))
            return events

        if len(game.turn_order) == 0:
            events.extend(game._game_over('none'))
            return events

        events.extend(game._end_turn())
        return events

    def eliminate(self, player_id):
        """Player has no cards to transmit — eliminated."""
        game = self.game
        self.dying_player = player_id
        events = [{
            'target': 'all',
            'msg': {
                'type': 'player_eliminated',
                'player_id': player_id,
                'reason': 'no_cards',
            }
        }]
        events.extend(self.finalize_death(player_id))
        return events
