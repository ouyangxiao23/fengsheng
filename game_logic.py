"""Game state machine for 绝密行动 (Secret Mission).

Pure logic — no I/O. Every public method returns list[dict] of events.
Each event: {'target': player_id|'all'|'all_except:<id>', 'msg': dict}
"""

from enum import Enum
from cards import create_deck, create_identities
import random


class Phase(str, Enum):
    WAITING = 'waiting'
    DRAW = 'draw'
    ACTION = 'action'
    TRANSMISSION = 'transmission'
    CONTENTION = 'contention'
    RECEPTION = 'reception'
    DYING = 'dying'
    DEATH_GIFT = 'death_gift'
    GAME_OVER = 'game_over'


class PlayerState:
    def __init__(self, player_id, name, identity):
        self.id = player_id
        self.name = name
        self.identity = identity  # 'resistance' | 'agency'
        self.hand = []            # list of card dicts
        self.intel_area = []      # list of card dicts (face-up, public)
        self.alive = True

    def hand_card(self, card_id):
        for c in self.hand:
            if c['id'] == card_id:
                return c
        return None

    def remove_hand_card(self, card_id):
        for i, c in enumerate(self.hand):
            if c['id'] == card_id:
                return self.hand.pop(i)
        return None

    def black_count(self):
        return sum(1 for c in self.intel_area if c['intel_color'] == 'black')

    def red_count(self):
        return sum(1 for c in self.intel_area if c['intel_color'] == 'red')

    def blue_count(self):
        return sum(1 for c in self.intel_area if c['intel_color'] == 'blue')


class GameState:
    def __init__(self, player_ids, player_names):
        """Initialize game with player IDs and names (both lists, same order)."""
        self.player_ids = list(player_ids)
        self.player_names = dict(zip(player_ids, player_names))
        self.players = {}
        self.turn_order = []       # alive players in seating order
        self.all_seats = []        # original seating (never changes)
        self.current_turn_idx = 0
        self.phase = Phase.WAITING
        self.deck = []
        self.discard = []

        # Transmission state
        self.intel_card = None
        self.intel_direction = None  # 'left' | 'right'
        self.intel_sender = None
        self.intel_facing = None     # player the intel is currently in front of
        self.intel_locked = None     # player who must accept (or None)
        self.intel_accepted_by = None

        # Contention state
        self.contention_order = []
        self.contention_idx = 0
        self.contention_all_passed = False

        # Dying state
        self.dying_player = None
        self.rescue_order = []
        self.rescue_idx = 0

        # Burn state (peek at intel during burn resolution)
        self.pending_burn_player = None

    # ── Setup ──────────────────────────────────────────────────

    def setup(self):
        """Deal identities and starting hands. Returns events."""
        n = len(self.player_ids)
        identities = create_identities(n)
        self.deck = create_deck()

        # Create player states and seating
        for i, pid in enumerate(self.player_ids):
            self.players[pid] = PlayerState(pid, self.player_names[pid], identities[i])

        self.all_seats = list(self.player_ids)
        self.turn_order = list(self.player_ids)

        # Random first player
        self.current_turn_idx = random.randint(0, n - 1)

        events = []

        # Send identity to each player
        for pid, ps in self.players.items():
            events.append({
                'target': pid,
                'msg': {
                    'type': 'game_start',
                    'your_identity': ps.identity,
                    'turn_order': self.all_seats,
                    'player_names': self.player_names,
                    'first_player': self.current_player_id(),
                }
            })

        # Deal 3 starting cards to each player
        for pid in self.all_seats:
            cards = self._draw_cards(3)
            self.players[pid].hand.extend(cards)
            events.append({
                'target': pid,
                'msg': {'type': 'deal_hand', 'cards': cards}
            })

        # Broadcast hand counts
        events.extend(self._hand_count_events())

        # Start first turn
        events.extend(self._start_draw_phase())

        return events

    # ── Draw Phase ─────────────────────────────────────────────

    def _start_draw_phase(self):
        self.phase = Phase.DRAW
        pid = self.current_player_id()
        events = [self._phase_change_event()]

        # Auto-draw 3 cards
        cards = self._draw_cards(3)
        self.players[pid].hand.extend(cards)
        events.append({
            'target': pid,
            'msg': {'type': 'draw_cards', 'cards': cards}
        })
        events.append({
            'target': f'all_except:{pid}',
            'msg': {'type': 'draw_cards', 'player_id': pid, 'count': len(cards)}
        })
        events.extend(self._hand_count_events())

        # Auto-advance to action phase
        events.extend(self._start_action_phase())
        return events

    def _start_action_phase(self):
        self.phase = Phase.ACTION
        return [self._phase_change_event()]

    # ── Action Phase ───────────────────────────────────────────

    def play_action_card(self, player_id, card_id, target_id=None):
        """Play a card for its action effect during action phase."""
        events = []
        if self.phase != Phase.ACTION:
            return [self._error(player_id, '当前不是出牌阶段')]
        if player_id != self.current_player_id():
            return [self._error(player_id, '不是你的回合')]

        ps = self.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [self._error(player_id, '你没有这张牌')]
        if card['action_phase'] != 'action':
            return [self._error(player_id, '这张牌不能在出牌阶段使用')]

        # Remove card from hand
        ps.remove_hand_card(card_id)

        # Broadcast card played (hidden cards show null to others)
        if card.get('has_hidden'):
            events.append({
                'target': player_id,
                'msg': {'type': 'card_played', 'player_id': player_id, 'card': card}
            })
            events.append({
                'target': f'all_except:{player_id}',
                'msg': {'type': 'card_played', 'player_id': player_id, 'card': None,
                        'action_name': card['action_name']}
            })
        else:
            events.append({
                'target': 'all',
                'msg': {'type': 'card_played', 'player_id': player_id, 'card': card}
            })

        # Resolve effect
        effect = card['action_effect']
        if effect == 'probe':
            events.extend(self._resolve_probe(player_id, target_id))
        elif effect == 'coerce':
            events.extend(self._resolve_coerce(player_id, target_id))
        elif effect == 'clarify':
            events.extend(self._resolve_clarify_action(player_id, target_id))
        elif effect == 'secret_order':
            events.extend(self._resolve_secret_order(player_id))

        self.discard.append(card)
        events.extend(self._hand_count_events())
        return events

    def end_action_phase(self, player_id):
        """Player declares action phase done. Move to transmission."""
        if self.phase != Phase.ACTION:
            return [self._error(player_id, '当前不是出牌阶段')]
        if player_id != self.current_player_id():
            return [self._error(player_id, '不是你的回合')]

        # Check if player has cards to transmit
        ps = self.players[player_id]
        if len(ps.hand) == 0:
            # No cards = eliminated
            return self._eliminate_player(player_id)

        self.phase = Phase.TRANSMISSION
        return [self._phase_change_event()]

    # ── Transmission Phase ─────────────────────────────────────

    def transmit_intel(self, player_id, card_id, direction=None, lock_target=None):
        """Player sends a card as intel."""
        if self.phase != Phase.TRANSMISSION:
            return [self._error(player_id, '当前不是传递阶段')]
        if player_id != self.current_player_id():
            return [self._error(player_id, '不是你的回合')]

        ps = self.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [self._error(player_id, '你没有这张牌')]

        # Determine direction
        card_dir = card['direction']
        if card_dir == 'any':
            if direction not in ('left', 'right'):
                return [self._error(player_id, '请选择传递方向')]
            actual_dir = direction
        else:
            actual_dir = card_dir

        # Lock target validation
        if lock_target:
            if not card['has_lock']:
                return [self._error(player_id, '此牌没有锁定属性')]
            if lock_target not in self.turn_order or lock_target == player_id:
                return [self._error(player_id, '无效的锁定目标')]
            if not self.players[lock_target].alive:
                return [self._error(player_id, '目标玩家已死亡')]

        # Remove card from hand, set as intel
        ps.remove_hand_card(card_id)
        self.intel_card = card
        self.intel_direction = actual_dir
        self.intel_sender = player_id
        self.intel_locked = lock_target

        # Find first player in direction
        next_player = self._next_alive_player(player_id, actual_dir)
        self.intel_facing = next_player
        self.intel_accepted_by = None

        events = []
        events.extend(self._hand_count_events())

        # Broadcast transmission (card is face-down — no details)
        events.append({
            'target': 'all',
            'msg': {
                'type': 'intel_transmitted',
                'sender_id': player_id,
                'direction': actual_dir,
                'is_locked': lock_target is not None,
                'lock_target': lock_target,
                'facing': next_player,
            }
        })

        # If locked target, and this is the locked player, they must accept
        if lock_target and next_player == lock_target:
            return events + self._force_accept(next_player)

        return events

    def accept_intel(self, player_id):
        """Player accepts the intel facing them."""
        if self.phase != Phase.TRANSMISSION:
            return [self._error(player_id, '当前不是传递阶段')]
        if player_id != self.intel_facing:
            return [self._error(player_id, '情报不在你面前')]

        self.intel_accepted_by = player_id
        events = [{
            'target': 'all',
            'msg': {'type': 'intel_accepted', 'player_id': player_id}
        }]

        # Move to contention phase
        events.extend(self._start_contention())
        return events

    def pass_intel(self, player_id):
        """Player passes intel to next player in direction."""
        if self.phase != Phase.TRANSMISSION:
            return [self._error(player_id, '当前不是传递阶段')]
        if player_id != self.intel_facing:
            return [self._error(player_id, '情报不在你面前')]
        if self.intel_locked and player_id == self.intel_locked:
            return [self._error(player_id, '你被锁定，必须接收')]

        # Move intel to next player
        next_player = self._next_alive_player(player_id, self.intel_direction)

        # If intel comes back to sender, sender must accept
        if next_player == self.intel_sender:
            self.intel_facing = next_player
            events = [{
                'target': 'all',
                'msg': {'type': 'intel_moved', 'from_player': player_id, 'to_player': next_player}
            }]
            return events + self._force_accept(next_player)

        self.intel_facing = next_player
        events = [{
            'target': 'all',
            'msg': {'type': 'intel_moved', 'from_player': player_id, 'to_player': next_player}
        }]

        # If locked and next player is the target, force accept
        if self.intel_locked and next_player == self.intel_locked:
            return events + self._force_accept(next_player)

        return events

    def _force_accept(self, player_id):
        """Force a player to accept intel (locked or returned to sender)."""
        self.intel_accepted_by = player_id
        events = [{
            'target': 'all',
            'msg': {'type': 'intel_accepted', 'player_id': player_id}
        }]
        events.extend(self._start_contention())
        return events

    # ── Contention Phase ───────────────────────────────────────

    def _start_contention(self):
        """Begin contention round. Ask players in order starting from accepter."""
        self.phase = Phase.CONTENTION
        # Build contention order: all alive players starting from accepter, going CCW
        order = []
        start = self.turn_order.index(self.intel_accepted_by)
        n = len(self.turn_order)
        for i in range(n):
            pid = self.turn_order[(start + i) % n]
            if self.players[pid].alive:
                order.append(pid)
        self.contention_order = order
        self.contention_idx = 0
        self.contention_all_passed = False

        events = [self._phase_change_event()]
        events.extend(self._ask_contention())
        return events

    def _ask_contention(self):
        """Ask the current contention player if they want to play."""
        if self.contention_idx >= len(self.contention_order):
            # All players had a chance — resolve reception
            return self._resolve_reception()

        pid = self.contention_order[self.contention_idx]
        return [{
            'target': 'all',
            'msg': {'type': 'contention_ask', 'player_id': pid}
        }]

    def play_contention_card(self, player_id, card_id, extra=None):
        """Player plays a contention-phase card."""
        if self.phase != Phase.CONTENTION:
            return [self._error(player_id, '当前不是争夺阶段')]
        if self.contention_idx >= len(self.contention_order):
            return [self._error(player_id, '争夺已结束')]
        if player_id != self.contention_order[self.contention_idx]:
            return [self._error(player_id, '还没轮到你')]

        ps = self.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [self._error(player_id, '你没有这张牌')]
        if card['action_phase'] != 'contention':
            return [self._error(player_id, '这张牌不能在争夺阶段使用')]

        ps.remove_hand_card(card_id)

        events = [{
            'target': 'all',
            'msg': {'type': 'card_played', 'player_id': player_id, 'card': card}
        }]

        # Resolve effect
        effect = card['action_effect']
        if effect == 'intercept':
            events.extend(self._resolve_intercept(player_id))
        elif effect == 'switch':
            events.extend(self._resolve_switch(player_id, extra))
        elif effect == 'decoy':
            events.extend(self._resolve_decoy(player_id))
        elif effect == 'burn':
            events.extend(self._resolve_burn(player_id))
        elif effect == 'return':
            events.extend(self._resolve_return(player_id))

        self.discard.append(card)
        events.extend(self._hand_count_events())

        # After a contention card, restart contention from the affected player
        # (all players get another chance)
        self.contention_idx = 0
        events.extend(self._ask_contention())
        return events

    def pass_contention(self, player_id):
        """Player passes in contention."""
        if self.phase != Phase.CONTENTION:
            return [self._error(player_id, '当前不是争夺阶段')]
        if self.contention_idx >= len(self.contention_order):
            return [self._error(player_id, '争夺已结束')]
        if player_id != self.contention_order[self.contention_idx]:
            return [self._error(player_id, '还没轮到你')]

        self.contention_idx += 1
        if self.contention_idx >= len(self.contention_order):
            return self._resolve_reception()

        return self._ask_contention()

    # ── Contention Effects ─────────────────────────────────────

    def _resolve_intercept(self, player_id):
        """Player becomes the new receiver."""
        old_receiver = self.intel_accepted_by
        self.intel_accepted_by = player_id
        # Rebuild contention order starting from new receiver
        order = []
        start = self.turn_order.index(player_id)
        n = len(self.turn_order)
        for i in range(n):
            pid = self.turn_order[(start + i) % n]
            if self.players[pid].alive:
                order.append(pid)
        self.contention_order = order
        return [{
            'target': 'all',
            'msg': {
                'type': 'contention_result',
                'effect': 'intercept',
                'player_id': player_id,
                'old_receiver': old_receiver,
            }
        }]

    def _resolve_switch(self, player_id, swap_card_id):
        """Swap intel card with a hand card."""
        if not swap_card_id:
            return [self._error(player_id, '请选择要替换的手牌')]
        ps = self.players[player_id]
        swap_card = ps.hand_card(swap_card_id)
        if not swap_card:
            return [self._error(player_id, '你没有这张牌')]

        ps.remove_hand_card(swap_card_id)
        old_intel = self.intel_card
        self.intel_card = swap_card
        ps.hand.append(old_intel)

        # Only the switcher knows what happened; others just know a switch occurred
        return [
            {
                'target': player_id,
                'msg': {
                    'type': 'contention_result',
                    'effect': 'switch',
                    'player_id': player_id,
                    'new_hand_card': old_intel,
                }
            },
            {
                'target': f'all_except:{player_id}',
                'msg': {
                    'type': 'contention_result',
                    'effect': 'switch',
                    'player_id': player_id,
                }
            }
        ]

    def _resolve_decoy(self, player_id):
        """Reverse intel direction."""
        old_dir = self.intel_direction
        self.intel_direction = 'left' if old_dir == 'right' else 'right'
        return [{
            'target': 'all',
            'msg': {
                'type': 'contention_result',
                'effect': 'decoy',
                'player_id': player_id,
                'new_direction': self.intel_direction,
            }
        }]

    def _resolve_burn(self, player_id):
        """Peek at intel; if color matches any in receiver's area, discard it."""
        receiver = self.intel_accepted_by
        receiver_ps = self.players[receiver]
        intel_color = self.intel_card['intel_color']
        receiver_colors = [c['intel_color'] for c in receiver_ps.intel_area]

        # Burner sees the card
        events = [{
            'target': player_id,
            'msg': {
                'type': 'burn_peek',
                'card': self.intel_card,
            }
        }]

        if intel_color in receiver_colors:
            # Discard the intel — skip reception
            self.discard.append(self.intel_card)
            self.intel_card = None
            events.append({
                'target': 'all',
                'msg': {
                    'type': 'contention_result',
                    'effect': 'burn_success',
                    'player_id': player_id,
                    'intel_color': intel_color,
                }
            })
            # End this turn — no reception needed
            events.extend(self._end_turn())
            return events
        else:
            events.append({
                'target': 'all',
                'msg': {
                    'type': 'contention_result',
                    'effect': 'burn_fail',
                    'player_id': player_id,
                }
            })
            return events

    def _resolve_return(self, player_id):
        """Send intel back to sender. Sender must accept."""
        self.intel_accepted_by = self.intel_sender
        # Rebuild contention order from sender
        order = []
        start = self.turn_order.index(self.intel_sender)
        n = len(self.turn_order)
        for i in range(n):
            pid = self.turn_order[(start + i) % n]
            if self.players[pid].alive:
                order.append(pid)
        self.contention_order = order
        return [{
            'target': 'all',
            'msg': {
                'type': 'contention_result',
                'effect': 'return',
                'player_id': player_id,
                'receiver': self.intel_sender,
            }
        }]

    # ── Reception ──────────────────────────────────────────────

    def _resolve_reception(self):
        """Flip intel, add to receiver's area, check win/death."""
        if self.intel_card is None:
            # Burn already removed it
            return self._end_turn()

        self.phase = Phase.RECEPTION
        receiver = self.intel_accepted_by
        receiver_ps = self.players[receiver]

        card = self.intel_card
        receiver_ps.intel_area.append(card)
        self.intel_card = None

        events = [self._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {
                'type': 'intel_received',
                'player_id': receiver,
                'card': card,
            }
        })

        # Check win condition
        win = self._check_win(receiver)
        if win:
            events.extend(win)
            return events

        # Check death condition (3 black)
        if receiver_ps.black_count() >= 3:
            events.extend(self._start_dying(receiver))
            return events

        # Normal end of turn
        events.extend(self._end_turn())
        return events

    # ── Win Check ──────────────────────────────────────────────

    def _check_win(self, receiver_id):
        """Check if receiving intel triggers a win. Returns events or None."""
        ps = self.players[receiver_id]
        faction = ps.identity

        if faction == 'resistance' and ps.red_count() >= 3:
            return self._game_over('resistance')
        if faction == 'agency' and ps.blue_count() >= 3:
            return self._game_over('agency')

        return None

    def _game_over(self, winning_faction):
        self.phase = Phase.GAME_OVER
        winners = [pid for pid, ps in self.players.items()
                   if ps.identity == winning_faction]
        identities = {pid: ps.identity for pid, ps in self.players.items()}
        return [{
            'target': 'all',
            'msg': {
                'type': 'game_over',
                'winning_faction': winning_faction,
                'winners': winners,
                'identities': identities,
            }
        }]

    # ── Dying & Death ──────────────────────────────────────────

    def _start_dying(self, player_id):
        """Begin dying rescue round."""
        self.phase = Phase.DYING
        self.dying_player = player_id

        # Rescue order: all alive players starting from current turn player
        order = []
        start = self.turn_order.index(self.current_player_id())
        n = len(self.turn_order)
        for i in range(n):
            pid = self.turn_order[(start + i) % n]
            if self.players[pid].alive:
                order.append(pid)
        self.rescue_order = order
        self.rescue_idx = 0

        events = [self._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {'type': 'dying', 'player_id': player_id}
        })
        events.extend(self._ask_rescue())
        return events

    def _ask_rescue(self):
        if self.rescue_idx >= len(self.rescue_order):
            # Nobody saved — player dies
            return self._player_dies(self.dying_player)

        pid = self.rescue_order[self.rescue_idx]
        return [{
            'target': 'all',
            'msg': {'type': 'rescue_ask', 'player_id': pid}
        }]

    def play_clarify_rescue(self, player_id, card_id, target_card_color=None):
        """Play Clarify to save dying player."""
        if self.phase != Phase.DYING:
            return [self._error(player_id, '当前不是濒死阶段')]
        if player_id != self.rescue_order[self.rescue_idx]:
            return [self._error(player_id, '还没轮到你')]

        ps = self.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [self._error(player_id, '你没有这张牌')]
        if card['action_effect'] != 'clarify':
            return [self._error(player_id, '只能使用澄清牌')]

        # Remove a black intel from dying player
        dying_ps = self.players[self.dying_player]
        black_cards = [c for c in dying_ps.intel_area if c['intel_color'] == 'black']
        if not black_cards:
            return [self._error(player_id, '没有黑色情报可移除')]

        # Remove the first black card
        removed = black_cards[0]
        dying_ps.intel_area.remove(removed)
        self.discard.append(removed)

        # Discard the clarify card
        ps.remove_hand_card(card_id)
        self.discard.append(card)

        events = [{
            'target': 'all',
            'msg': {
                'type': 'card_played',
                'player_id': player_id,
                'card': card,
            }
        }]
        events.extend(self._hand_count_events())
        events.append({
            'target': 'all',
            'msg': {
                'type': 'player_saved',
                'player_id': self.dying_player,
                'savior_id': player_id,
                'removed_intel': removed,
            }
        })

        # Check if still dying (might still have 3+ black)
        if dying_ps.black_count() >= 3:
            self.rescue_idx = 0
            events.extend(self._ask_rescue())
        else:
            self.dying_player = None
            events.extend(self._end_turn())

        return events

    def pass_rescue(self, player_id):
        """Decline to save dying player."""
        if self.phase != Phase.DYING:
            return [self._error(player_id, '当前不是濒死阶段')]
        if player_id != self.rescue_order[self.rescue_idx]:
            return [self._error(player_id, '还没轮到你')]

        self.rescue_idx += 1
        return self._ask_rescue()

    def _player_dies(self, player_id):
        """Player dies. Enter death gift phase."""
        self.phase = Phase.DEATH_GIFT
        ps = self.players[player_id]

        events = [self._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {'type': 'player_died', 'player_id': player_id}
        })

        if len(ps.hand) == 0:
            # No cards to gift, skip gift phase
            return events + self._finalize_death(player_id)

        # Send dying player their hand so they can choose gifts
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
        if self.phase != Phase.DEATH_GIFT:
            return [self._error(player_id, '当前不是遗赠阶段')]
        if player_id != self.dying_player:
            return [self._error(player_id, '你不在濒死状态')]
        if len(card_ids) > 3:
            return [self._error(player_id, '最多赠送3张牌')]
        if recipient_id and (recipient_id not in self.players or
                             not self.players[recipient_id].alive or
                             recipient_id == player_id):
            return [self._error(player_id, '无效的赠送目标')]

        ps = self.players[player_id]
        events = []

        if recipient_id and card_ids:
            recipient = self.players[recipient_id]
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

        events.extend(self._finalize_death(player_id))
        return events

    def _finalize_death(self, player_id):
        """Remove dead player from game, discard remaining cards."""
        ps = self.players[player_id]
        ps.alive = False

        # Discard remaining hand and intel
        self.discard.extend(ps.hand)
        self.discard.extend(ps.intel_area)
        ps.hand.clear()
        ps.intel_area.clear()

        # Remove from turn order
        if player_id in self.turn_order:
            dead_idx = self.turn_order.index(player_id)
            self.turn_order.remove(player_id)
            # Adjust current turn index
            if dead_idx < self.current_turn_idx:
                self.current_turn_idx -= 1
            elif dead_idx == self.current_turn_idx:
                # Current player died — their turn is over
                if self.current_turn_idx >= len(self.turn_order):
                    self.current_turn_idx = 0

        self.dying_player = None
        events = self._hand_count_events()

        # Check if game should end (only one faction left alive)
        alive_factions = set(self.players[pid].identity for pid in self.turn_order
                            if self.players[pid].alive)
        if len(alive_factions) <= 1 and len(self.turn_order) > 0:
            # Remaining faction wins
            faction = alive_factions.pop()
            events.extend(self._game_over(faction))
            return events

        if len(self.turn_order) == 0:
            # Everyone dead (shouldn't happen normally)
            events.extend(self._game_over('none'))
            return events

        events.extend(self._end_turn())
        return events

    # ── Action Effects ─────────────────────────────────────────

    def _resolve_probe(self, player_id, target_id):
        """Look at target's identity card."""
        if not target_id or target_id not in self.players:
            return [self._error(player_id, '请选择一个目标')]
        target = self.players[target_id]
        return [{
            'target': player_id,
            'msg': {
                'type': 'action_effect',
                'effect': 'probe',
                'target_id': target_id,
                'identity': target.identity,
            }
        }]

    def _resolve_coerce(self, player_id, target_id):
        """Target reveals hand or gives a card. For simplicity: target gives 1 card."""
        if not target_id or target_id not in self.players:
            return [self._error(player_id, '请选择一个目标')]
        target = self.players[target_id]
        if len(target.hand) == 0:
            return [{'target': 'all', 'msg': {
                'type': 'action_effect', 'effect': 'coerce',
                'target_id': target_id, 'result': 'no_cards'
            }}]

        # Target gives a random card to the coercer
        card = target.hand.pop(random.randint(0, len(target.hand) - 1))
        self.players[player_id].hand.append(card)

        events = [{
            'target': player_id,
            'msg': {
                'type': 'action_effect',
                'effect': 'coerce',
                'target_id': target_id,
                'result': 'gave_card',
                'card': card,
            }
        }, {
            'target': target_id,
            'msg': {
                'type': 'action_effect',
                'effect': 'coerce_lost',
                'coercer_id': player_id,
                'card': card,
            }
        }, {
            'target': f'all_except:{player_id},{target_id}',
            'msg': {
                'type': 'action_effect',
                'effect': 'coerce',
                'target_id': target_id,
                'coercer_id': player_id,
                'result': 'gave_card',
            }
        }]
        return events

    def _resolve_clarify_action(self, player_id, target_id):
        """Remove 1 black intel from target during action phase."""
        if not target_id or target_id not in self.players:
            return [self._error(player_id, '请选择一个目标')]
        target = self.players[target_id]
        black_cards = [c for c in target.intel_area if c['intel_color'] == 'black']
        if not black_cards:
            return [self._error(player_id, '目标没有黑色情报')]
        removed = black_cards[0]
        target.intel_area.remove(removed)
        self.discard.append(removed)
        return [{
            'target': 'all',
            'msg': {
                'type': 'action_effect',
                'effect': 'clarify',
                'player_id': player_id,
                'target_id': target_id,
                'removed_intel': removed,
            }
        }]

    def _resolve_secret_order(self, player_id):
        """Draw 1 extra card."""
        cards = self._draw_cards(1)
        self.players[player_id].hand.extend(cards)
        events = [{
            'target': player_id,
            'msg': {
                'type': 'action_effect',
                'effect': 'secret_order',
                'cards': cards,
            }
        }, {
            'target': f'all_except:{player_id}',
            'msg': {
                'type': 'action_effect',
                'effect': 'secret_order',
                'player_id': player_id,
            }
        }]
        return events

    # ── Elimination (no cards to transmit) ─────────────────────

    def _eliminate_player(self, player_id):
        """Player has no cards to transmit — eliminated."""
        self.dying_player = player_id
        events = [{
            'target': 'all',
            'msg': {
                'type': 'player_eliminated',
                'player_id': player_id,
                'reason': 'no_cards',
            }
        }]
        events.extend(self._finalize_death(player_id))
        return events

    # ── Turn Management ────────────────────────────────────────

    def current_player_id(self):
        if not self.turn_order:
            return None
        return self.turn_order[self.current_turn_idx % len(self.turn_order)]

    def _end_turn(self):
        """Advance to next player's draw phase."""
        if self.phase == Phase.GAME_OVER:
            return []
        self._reset_transmission_state()
        self.current_turn_idx = (self.current_turn_idx + 1) % len(self.turn_order)
        return self._start_draw_phase()

    def _reset_transmission_state(self):
        self.intel_card = None
        self.intel_direction = None
        self.intel_sender = None
        self.intel_facing = None
        self.intel_locked = None
        self.intel_accepted_by = None
        self.contention_order = []
        self.contention_idx = 0

    def _next_alive_player(self, from_id, direction):
        """Get next alive player in direction from given player (by seating)."""
        seats = self.all_seats
        idx = seats.index(from_id)
        n = len(seats)
        step = 1 if direction == 'right' else -1  # right = next seat, left = prev
        for i in range(1, n):
            check_idx = (idx + step * i) % n
            pid = seats[check_idx]
            if self.players[pid].alive:
                return pid
        return from_id  # Shouldn't happen if >1 alive

    # ── Deck Management ────────────────────────────────────────

    def _draw_cards(self, count):
        """Draw cards from deck, reshuffling discard if needed."""
        drawn = []
        for _ in range(count):
            if not self.deck:
                if not self.discard:
                    break  # No cards anywhere
                self.deck = self.discard[:]
                self.discard.clear()
                random.shuffle(self.deck)
            drawn.append(self.deck.pop())
        return drawn

    # ── Event Helpers ──────────────────────────────────────────

    def _phase_change_event(self):
        return {
            'target': 'all',
            'msg': {
                'type': 'phase_change',
                'phase': self.phase.value,
                'current_player': self.current_player_id(),
            }
        }

    def _hand_count_events(self):
        return [{
            'target': 'all',
            'msg': {
                'type': 'hand_count_update',
                'counts': {pid: len(ps.hand) for pid, ps in self.players.items()}
            }
        }]

    def _error(self, player_id, message):
        return {
            'target': player_id,
            'msg': {'type': 'error', 'message': message}
        }

    # ── State Sync (for reconnection) ─────────────────────────

    def get_state_for_player(self, player_id):
        """Full visible state for a specific player (used on reconnect)."""
        ps = self.players.get(player_id)
        if not ps:
            return None

        players_view = {}
        for pid, p in self.players.items():
            players_view[pid] = {
                'id': pid,
                'name': p.name,
                'hand_count': len(p.hand),
                'intel_area': p.intel_area[:],  # Public
                'alive': p.alive,
            }

        state = {
            'type': 'game_state_sync',
            'your_identity': ps.identity,
            'your_hand': ps.hand[:],
            'your_intel': ps.intel_area[:],
            'phase': self.phase.value,
            'current_player': self.current_player_id(),
            'turn_order': self.all_seats,
            'alive_players': self.turn_order[:],
            'player_names': self.player_names,
            'players': players_view,
            'intel': {
                'active': self.intel_card is not None or self.intel_accepted_by is not None,
                'sender': self.intel_sender,
                'direction': self.intel_direction,
                'facing': self.intel_facing,
                'is_locked': self.intel_locked is not None,
                'lock_target': self.intel_locked,
                'accepted_by': self.intel_accepted_by,
            },
            'dying_player': self.dying_player,
        }

        if self.phase == Phase.CONTENTION and self.contention_idx < len(self.contention_order):
            state['contention_asking'] = self.contention_order[self.contention_idx]

        if self.phase == Phase.DYING and self.rescue_idx < len(self.rescue_order):
            state['rescue_asking'] = self.rescue_order[self.rescue_idx]

        return state
