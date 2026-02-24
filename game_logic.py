"""Game state machine for 绝密行动 (Secret Mission).

Pure logic — no I/O. Every public method returns list[dict] of events.
Each event: {'target': player_id|'all'|'all_except:<id>', 'msg': dict}

GameState is the orchestrator. Intel transmission, contention, and
rescue/dying logic are delegated to focused sub-managers.
"""

from enum import Enum
from cards import create_deck, create_identities
from intel_tracker import IntelTracker
from contention_manager import ContentionManager
from rescue_manager import RescueManager
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

        # Sub-managers
        self.intel_tracker = IntelTracker(self)
        self.contention_mgr = ContentionManager(self)
        self.rescue_mgr = RescueManager(self)

        # Coerce state (2-step resolution) — stays in orchestrator
        self.pending_coerce = None  # {coercer, target, card_type, matching_ids}

    # ── Delegated properties (so server.py reads work unchanged) ──

    @property
    def timer_signal(self):
        return self.contention_mgr.timer_signal

    @timer_signal.setter
    def timer_signal(self, v):
        self.contention_mgr.timer_signal = v

    @property
    def contention_pending(self):
        return self.contention_mgr.contention_pending

    @property
    def contention_pending_player(self):
        return self.contention_mgr.contention_pending_player

    @property
    def intel_card(self):
        return self.intel_tracker.intel_card

    @property
    def intel_direction(self):
        return self.intel_tracker.intel_direction

    @property
    def intel_sender(self):
        return self.intel_tracker.intel_sender

    @property
    def intel_facing(self):
        return self.intel_tracker.intel_facing

    @property
    def intel_target(self):
        return self.intel_tracker.intel_target

    @property
    def intel_locked(self):
        return self.intel_tracker.intel_locked

    @property
    def intel_accepted_by(self):
        return self.intel_tracker.intel_accepted_by

    @property
    def dying_player(self):
        return self.rescue_mgr.dying_player

    @dying_player.setter
    def dying_player(self, v):
        self.rescue_mgr.dying_player = v

    # ── Setup ──────────────────────────────────────────────────

    def setup(self):
        """Deal identities and starting hands. Returns events."""
        n = len(self.player_ids)
        identities = create_identities(n)
        self.deck = create_deck()

        for i, pid in enumerate(self.player_ids):
            self.players[pid] = PlayerState(pid, self.player_names[pid], identities[i])

        self.all_seats = list(self.player_ids)
        self.turn_order = list(self.player_ids)

        self.current_turn_idx = random.randint(0, n - 1)

        events = []

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

        for pid in self.all_seats:
            cards = self._draw_cards(3)
            self.players[pid].hand.extend(cards)
            events.append({
                'target': pid,
                'msg': {'type': 'deal_hand', 'cards': cards}
            })

        events.extend(self._hand_count_events())
        events.extend(self._start_draw_phase())

        return events

    # ── Draw Phase ─────────────────────────────────────────────

    def _start_draw_phase(self):
        self.phase = Phase.DRAW
        pid = self.current_player_id()
        events = [self._phase_change_event()]

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

        events.extend(self._start_action_phase())
        return events

    def _start_action_phase(self):
        self.phase = Phase.ACTION
        return [self._phase_change_event()]

    # ── Action Phase ───────────────────────────────────────────

    def play_action_card(self, player_id, card_id, target_id=None, card_type=None, intel_card_id=None):
        """Play a card for its action effect during action phase."""
        events = []
        if self.phase != Phase.ACTION:
            return [self._error(player_id, '当前不是出牌阶段')]
        if player_id != self.current_player_id():
            return [self._error(player_id, '不是你的回合')]
        if self.pending_coerce:
            return [self._error(player_id, '正在等待威逼回应')]

        ps = self.players[player_id]
        card = ps.hand_card(card_id)
        if not card:
            return [self._error(player_id, '你没有这张牌')]
        if card['action_phase'] != 'action':
            return [self._error(player_id, '这张牌不能在出牌阶段使用')]

        effect = card['action_effect']
        if effect == 'coerce':
            if not target_id or target_id not in self.players:
                return [self._error(player_id, '请选择一个目标')]
            if card_type not in ('intercept', 'switch', 'clarify', 'decoy'):
                return [self._error(player_id, '请选择要威逼的牌类型')]
        elif effect == 'clarify':
            if not target_id or target_id not in self.players:
                return [self._error(player_id, '请选择一个目标')]
            target_ps = self.players[target_id]
            if not target_ps.intel_area:
                return [self._error(player_id, '目标没有情报')]
        elif effect == 'probe':
            if not target_id or target_id not in self.players:
                return [self._error(player_id, '请选择一个目标')]

        ps.remove_hand_card(card_id)

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

        if effect == 'probe':
            events.extend(self._resolve_probe(player_id, target_id))
        elif effect == 'coerce':
            events.extend(self._resolve_coerce(player_id, target_id, card_type))
        elif effect == 'clarify':
            events.extend(self._resolve_clarify_action(player_id, target_id, intel_card_id))

        self.discard.append(card)
        events.extend(self._hand_count_events())
        return events

    def end_action_phase(self, player_id):
        """Player declares action phase done. Move to transmission."""
        if self.phase != Phase.ACTION:
            return [self._error(player_id, '当前不是出牌阶段')]
        if player_id != self.current_player_id():
            return [self._error(player_id, '不是你的回合')]
        if self.pending_coerce:
            return [self._error(player_id, '正在等待威逼回应')]

        ps = self.players[player_id]
        if len(ps.hand) == 0:
            return self.rescue_mgr.eliminate(player_id)

        self.phase = Phase.TRANSMISSION
        return [self._phase_change_event()]

    # ── Delegated Methods (same signatures as before) ──────────

    def transmit_intel(self, player_id, card_id, target=None, lock=None):
        return self.intel_tracker.transmit(player_id, card_id, target=target, lock=lock)

    def accept_intel(self, player_id):
        return self.intel_tracker.accept(player_id)

    def pass_intel(self, player_id):
        return self.intel_tracker.pass_intel(player_id)

    def play_contention_card(self, player_id, card_id):
        return self.contention_mgr.play_card(player_id, card_id)

    def resolve_decoy_direction(self, player_id, direction=None):
        return self.contention_mgr.resolve_decoy(player_id, direction=direction)

    def end_contention(self):
        return self.contention_mgr.end()

    def play_clarify_rescue(self, player_id, card_id, intel_card_id=None):
        return self.rescue_mgr.play_clarify(player_id, card_id, intel_card_id=intel_card_id)

    def pass_rescue(self, player_id):
        return self.rescue_mgr.pass_rescue(player_id)

    def death_gift(self, player_id, card_ids, recipient_id):
        return self.rescue_mgr.death_gift(player_id, card_ids, recipient_id)

    # ── Reception ──────────────────────────────────────────────

    def _resolve_reception(self):
        """Flip intel, add to receiver's area, check win/death."""
        self.phase = Phase.RECEPTION
        receiver = self.intel_tracker.intel_accepted_by
        receiver_ps = self.players[receiver]

        card = self.intel_tracker.intel_card
        receiver_ps.intel_area.append(card)
        self.intel_tracker.intel_card = None

        events = [self._phase_change_event()]
        events.append({
            'target': 'all',
            'msg': {
                'type': 'intel_received',
                'player_id': receiver,
                'card': card,
            }
        })

        win = self._check_win(receiver)
        if win:
            events.extend(win)
            return events

        if receiver_ps.black_count() >= 3:
            events.extend(self.rescue_mgr.start_dying(receiver))
            return events

        events.extend(self._end_turn())
        return events

    # ── Win Check ──────────────────────────────────────────────

    def _check_win(self, receiver_id):
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

    # ── Action Effects ─────────────────────────────────────────

    def _resolve_probe(self, player_id, target_id):
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

    def _resolve_coerce(self, player_id, target_id, card_type):
        if not target_id or target_id not in self.players:
            return [self._error(player_id, '请选择一个目标')]
        if card_type not in ('intercept', 'switch', 'clarify', 'decoy'):
            return [self._error(player_id, '请选择要威逼的牌类型')]
        target = self.players[target_id]

        matching = [c for c in target.hand if c['action_effect'] == card_type]

        if len(matching) == 0:
            events = [{
                'target': player_id,
                'msg': {
                    'type': 'action_effect',
                    'effect': 'coerce_reveal',
                    'target_id': target_id,
                    'hand': [c.copy() for c in target.hand],
                }
            }, {
                'target': target_id,
                'msg': {
                    'type': 'action_effect',
                    'effect': 'coerce_revealed',
                    'coercer_id': player_id,
                    'card_type': card_type,
                }
            }, {
                'target': f'all_except:{player_id},{target_id}',
                'msg': {
                    'type': 'action_effect',
                    'effect': 'coerce_no_match',
                    'coercer_id': player_id,
                    'target_id': target_id,
                    'card_type': card_type,
                }
            }]
            return events

        if len(matching) == 1:
            card = matching[0]
            target.remove_hand_card(card['id'])
            self.players[player_id].hand.append(card)
            events = [{
                'target': player_id,
                'msg': {
                    'type': 'action_effect',
                    'effect': 'coerce_gave',
                    'target_id': target_id,
                    'card': card,
                    'card_type': card_type,
                }
            }, {
                'target': target_id,
                'msg': {
                    'type': 'action_effect',
                    'effect': 'coerce_lost',
                    'coercer_id': player_id,
                    'card': card,
                    'card_type': card_type,
                }
            }, {
                'target': f'all_except:{player_id},{target_id}',
                'msg': {
                    'type': 'action_effect',
                    'effect': 'coerce_gave',
                    'coercer_id': player_id,
                    'target_id': target_id,
                    'card_type': card_type,
                }
            }]
            return events

        self.pending_coerce = {
            'coercer': player_id,
            'target': target_id,
            'card_type': card_type,
            'matching_ids': [c['id'] for c in matching],
        }
        events = [{
            'target': target_id,
            'msg': {
                'type': 'coerce_choose',
                'coercer_id': player_id,
                'card_type': card_type,
                'matching_ids': [c['id'] for c in matching],
            }
        }, {
            'target': player_id,
            'msg': {
                'type': 'coerce_waiting',
                'target_id': target_id,
                'card_type': card_type,
            }
        }, {
            'target': f'all_except:{player_id},{target_id}',
            'msg': {
                'type': 'coerce_pending',
                'coercer_id': player_id,
                'target_id': target_id,
                'card_type': card_type,
            }
        }]
        return events

    def resolve_coerce_response(self, player_id, card_id):
        """Target responds to coerce by giving a specific card."""
        if not self.pending_coerce:
            return [self._error(player_id, '没有待处理的威逼')]
        if player_id != self.pending_coerce['target']:
            return [self._error(player_id, '你不是威逼的目标')]
        if card_id not in self.pending_coerce['matching_ids']:
            return [self._error(player_id, '只能选择符合要求的牌')]

        coercer_id = self.pending_coerce['coercer']
        card_type = self.pending_coerce['card_type']
        self.pending_coerce = None

        target = self.players[player_id]
        card = target.remove_hand_card(card_id)
        if not card:
            return [self._error(player_id, '你没有这张牌')]
        self.players[coercer_id].hand.append(card)

        events = [{
            'target': coercer_id,
            'msg': {
                'type': 'action_effect',
                'effect': 'coerce_gave',
                'target_id': player_id,
                'card': card,
                'card_type': card_type,
            }
        }, {
            'target': player_id,
            'msg': {
                'type': 'action_effect',
                'effect': 'coerce_lost',
                'coercer_id': coercer_id,
                'card': card,
                'card_type': card_type,
            }
        }, {
            'target': f'all_except:{coercer_id},{player_id}',
            'msg': {
                'type': 'action_effect',
                'effect': 'coerce_gave',
                'coercer_id': coercer_id,
                'target_id': player_id,
                'card_type': card_type,
            }
        }]
        events.extend(self._hand_count_events())
        return events

    def _resolve_clarify_action(self, player_id, target_id, intel_card_id=None):
        if not target_id or target_id not in self.players:
            return [self._error(player_id, '请选择一个目标')]
        target = self.players[target_id]
        if not target.intel_area:
            return [self._error(player_id, '目标没有情报')]
        if intel_card_id:
            removed = None
            for c in target.intel_area:
                if c['id'] == intel_card_id:
                    removed = c
                    break
            if not removed:
                return [self._error(player_id, '指定的情报不存在')]
        else:
            removed = target.intel_area[0]
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

    # ── Turn Management ────────────────────────────────────────

    def current_player_id(self):
        if not self.turn_order:
            return None
        return self.turn_order[self.current_turn_idx % len(self.turn_order)]

    def _end_turn(self):
        if self.phase == Phase.GAME_OVER:
            return []
        self._reset_transmission_state()
        self.current_turn_idx = (self.current_turn_idx + 1) % len(self.turn_order)
        return self._start_draw_phase()

    def _reset_transmission_state(self):
        self.intel_tracker.reset()
        self.contention_mgr.reset()

    def _next_alive_player(self, from_id, direction):
        seats = self.all_seats
        idx = seats.index(from_id)
        n = len(seats)
        step = 1 if direction == 'right' else -1
        for i in range(1, n):
            check_idx = (idx + step * i) % n
            pid = seats[check_idx]
            if self.players[pid].alive:
                return pid
        return from_id

    # ── Deck Management ────────────────────────────────────────

    def _draw_cards(self, count):
        drawn = []
        for _ in range(count):
            if not self.deck:
                if not self.discard:
                    break
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
        ps = self.players.get(player_id)
        if not ps:
            return None

        players_view = {}
        for pid, p in self.players.items():
            players_view[pid] = {
                'id': pid,
                'name': p.name,
                'hand_count': len(p.hand),
                'intel_area': p.intel_area[:],
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
            'intel': self.intel_tracker.get_state(),
            'dying_player': self.dying_player,
        }

        if self.phase == Phase.CONTENTION:
            state['contention_pending'] = self.contention_pending
            state['contention_pending_player'] = self.contention_pending_player

        if self.phase == Phase.DYING and self.rescue_mgr.rescue_idx < len(self.rescue_mgr.rescue_order):
            state['rescue_asking'] = self.rescue_mgr.rescue_order[self.rescue_mgr.rescue_idx]

        if self.pending_coerce:
            pc = {
                'coercer': self.pending_coerce['coercer'],
                'target': self.pending_coerce['target'],
                'card_type': self.pending_coerce['card_type'],
            }
            if player_id == self.pending_coerce['target']:
                pc['matching_ids'] = self.pending_coerce['matching_ids']
            state['pending_coerce'] = pc

        return state
