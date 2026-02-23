"""Card deck definitions for 绝密行动 (Secret Mission).

Each card has dual identity:
- Intelligence color (red/blue/black) — matters when received as intel
- Action function — matters when played from hand for its effect

54 cards total: 18 red, 18 blue, 18 black.
"""

import random
import copy

# Action effect identifiers
PROBE = 'probe'           # 试探: look at target's identity
COERCE = 'coerce'         # 威逼: target reveals or gives 1 hand card
INTERCEPT = 'intercept'   # 截获: become the receiver
SWITCH = 'switch'         # 调包: swap intel with a hand card
CLARIFY = 'clarify'       # 澄清: remove 1 black intel from a player
DECOY = 'decoy'           # 误导: reverse intel direction
BURN = 'burn'             # 烧毁: peek; discard if color matches receiver's area
SECRET_ORDER = 'secret_order'  # 密令: draw 1 extra card
RETURN = 'return'         # 退回: send intel back to sender

# Phase restrictions
ACTION = 'action'
CONTENTION = 'contention'

# Directions
LEFT = 'left'
RIGHT = 'right'
ANY = 'any'

# Card template helper
def _card(id_str, color, action, action_cn, phase, direction,
          icon, lock=False, hidden=False):
    return {
        'id': id_str,
        'intel_color': color,
        'action_name': action_cn,
        'action_name_en': action,
        'action_effect': action.lower().replace(' ', '_'),
        'action_phase': phase,
        'direction': direction,
        'has_lock': lock,
        'has_hidden': hidden,
        'icon': icon,
    }


# Full deck: 54 cards
# Distribution: 18 red, 18 blue, 18 black
# Action types distributed across colors for balance
CARD_DEFINITIONS = [
    # === 试探 Probe (8 cards) — Action Phase, hidden ===
    _card('probe_r1', 'red',   'Probe', '试探', ACTION, LEFT,  '🔍', hidden=True),
    _card('probe_r2', 'red',   'Probe', '试探', ACTION, RIGHT, '🔍', hidden=True),
    _card('probe_r3', 'red',   'Probe', '试探', ACTION, ANY,   '🔍', hidden=True),
    _card('probe_b1', 'blue',  'Probe', '试探', ACTION, LEFT,  '🔍', hidden=True),
    _card('probe_b2', 'blue',  'Probe', '试探', ACTION, RIGHT, '🔍', hidden=True),
    _card('probe_b3', 'blue',  'Probe', '试探', ACTION, ANY,   '🔍', hidden=True),
    _card('probe_k1', 'black', 'Probe', '试探', ACTION, LEFT,  '🔍', hidden=True),
    _card('probe_k2', 'black', 'Probe', '试探', ACTION, RIGHT, '🔍', hidden=True),

    # === 威逼 Coerce (6 cards) — Action Phase, hidden ===
    _card('coerce_r1', 'red',   'Coerce', '威逼', ACTION, LEFT,  '👊', hidden=True),
    _card('coerce_r2', 'red',   'Coerce', '威逼', ACTION, RIGHT, '👊', hidden=True),
    _card('coerce_b1', 'blue',  'Coerce', '威逼', ACTION, LEFT,  '👊', hidden=True),
    _card('coerce_b2', 'blue',  'Coerce', '威逼', ACTION, RIGHT, '👊', hidden=True),
    _card('coerce_k1', 'black', 'Coerce', '威逼', ACTION, ANY,   '👊', hidden=True),
    _card('coerce_k2', 'black', 'Coerce', '威逼', ACTION, RIGHT, '👊', hidden=True),

    # === 截获 Intercept (8 cards) — Contention Phase ===
    _card('intercept_r1', 'red',   'Intercept', '截获', CONTENTION, LEFT,  '🛡'),
    _card('intercept_r2', 'red',   'Intercept', '截获', CONTENTION, RIGHT, '🛡'),
    _card('intercept_r3', 'red',   'Intercept', '截获', CONTENTION, ANY,   '🛡'),
    _card('intercept_b1', 'blue',  'Intercept', '截获', CONTENTION, LEFT,  '🛡'),
    _card('intercept_b2', 'blue',  'Intercept', '截获', CONTENTION, RIGHT, '🛡'),
    _card('intercept_b3', 'blue',  'Intercept', '截获', CONTENTION, ANY,   '🛡'),
    _card('intercept_k1', 'black', 'Intercept', '截获', CONTENTION, LEFT,  '🛡'),
    _card('intercept_k2', 'black', 'Intercept', '截获', CONTENTION, RIGHT, '🛡'),

    # === 调包 Switch (6 cards) — Contention Phase ===
    _card('switch_r1', 'red',   'Switch', '调包', CONTENTION, LEFT,  '🔄'),
    _card('switch_r2', 'red',   'Switch', '调包', CONTENTION, RIGHT, '🔄'),
    _card('switch_b1', 'blue',  'Switch', '调包', CONTENTION, LEFT,  '🔄'),
    _card('switch_b2', 'blue',  'Switch', '调包', CONTENTION, RIGHT, '🔄'),
    _card('switch_k1', 'black', 'Switch', '调包', CONTENTION, ANY,   '🔄'),
    _card('switch_k2', 'black', 'Switch', '调包', CONTENTION, RIGHT, '🔄'),

    # === 澄清 Clarify (8 cards) — Action Phase (also usable during Dying) ===
    _card('clarify_r1', 'red',   'Clarify', '澄清', ACTION, LEFT,  '✨'),
    _card('clarify_r2', 'red',   'Clarify', '澄清', ACTION, RIGHT, '✨'),
    _card('clarify_r3', 'red',   'Clarify', '澄清', ACTION, ANY,   '✨'),
    _card('clarify_b1', 'blue',  'Clarify', '澄清', ACTION, LEFT,  '✨'),
    _card('clarify_b2', 'blue',  'Clarify', '澄清', ACTION, RIGHT, '✨'),
    _card('clarify_b3', 'blue',  'Clarify', '澄清', ACTION, ANY,   '✨'),
    _card('clarify_k1', 'black', 'Clarify', '澄清', ACTION, LEFT,  '✨'),
    _card('clarify_k2', 'black', 'Clarify', '澄清', ACTION, RIGHT, '✨'),

    # === 误导 Decoy (6 cards) — Contention Phase ===
    _card('decoy_r1', 'red',   'Decoy', '误导', CONTENTION, LEFT,  '↩'),
    _card('decoy_r2', 'red',   'Decoy', '误导', CONTENTION, ANY,   '↩'),
    _card('decoy_b1', 'blue',  'Decoy', '误导', CONTENTION, RIGHT, '↩'),
    _card('decoy_b2', 'blue',  'Decoy', '误导', CONTENTION, ANY,   '↩'),
    _card('decoy_k1', 'black', 'Decoy', '误导', CONTENTION, LEFT,  '↩'),
    _card('decoy_k2', 'black', 'Decoy', '误导', CONTENTION, RIGHT, '↩'),

    # === 烧毁 Burn (4 cards) — Contention Phase ===
    _card('burn_r1', 'red',   'Burn', '烧毁', CONTENTION, RIGHT, '🔥'),
    _card('burn_b1', 'blue',  'Burn', '烧毁', CONTENTION, LEFT,  '🔥'),
    _card('burn_k1', 'black', 'Burn', '烧毁', CONTENTION, ANY,   '🔥'),
    _card('burn_k2', 'black', 'Burn', '烧毁', CONTENTION, RIGHT, '🔥'),

    # === 密令 Secret Order (4 cards) — Action Phase, has lock ===
    _card('secret_r1', 'red',  'Secret Order', '密令', ACTION, ANY,   '📜', lock=True),
    _card('secret_b1', 'blue', 'Secret Order', '密令', ACTION, ANY,   '📜', lock=True),
    _card('secret_k1', 'black','Secret Order', '密令', ACTION, LEFT,  '📜', lock=True),
    _card('secret_k2', 'black','Secret Order', '密令', ACTION, RIGHT, '📜', lock=True),

    # === 退回 Return (4 cards) — Contention Phase ===
    _card('return_r1', 'red',   'Return', '退回', CONTENTION, LEFT,  '⏪'),
    _card('return_b1', 'blue',  'Return', '退回', CONTENTION, RIGHT, '⏪'),
    _card('return_k1', 'black', 'Return', '退回', CONTENTION, ANY,   '⏪'),
    _card('return_k2', 'black', 'Return', '退回', CONTENTION, LEFT,  '⏪'),
]

assert len(CARD_DEFINITIONS) == 54, f"Deck has {len(CARD_DEFINITIONS)} cards, expected 54"

# Verify color distribution
_color_counts = {}
for c in CARD_DEFINITIONS:
    _color_counts[c['intel_color']] = _color_counts.get(c['intel_color'], 0) + 1
assert _color_counts == {'red': 18, 'blue': 18, 'black': 18}, f"Color distribution: {_color_counts}"


# Identity distribution for v1 (no Mystics — Resistance vs Agency only)
IDENTITY_DISTRIBUTION = {
    2: {'resistance': 1, 'agency': 1},
    3: {'resistance': 2, 'agency': 1},
    4: {'resistance': 2, 'agency': 2},
    5: {'resistance': 3, 'agency': 2},
    6: {'resistance': 3, 'agency': 3},
    7: {'resistance': 4, 'agency': 3},
    8: {'resistance': 4, 'agency': 4},
}


def create_deck():
    """Create a shuffled copy of the full deck."""
    deck = copy.deepcopy(CARD_DEFINITIONS)
    random.shuffle(deck)
    return deck


def create_identities(player_count):
    """Create shuffled identity list for given player count.

    Returns list of 'resistance' or 'agency' strings, one per player.
    """
    dist = IDENTITY_DISTRIBUTION.get(player_count)
    if not dist:
        raise ValueError(f"Unsupported player count: {player_count}")
    identities = []
    for faction, count in dist.items():
        identities.extend([faction] * count)
    random.shuffle(identities)
    return identities
