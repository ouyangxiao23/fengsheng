Resume this session with:                                                                       
claude --resume 095cb2a2-313b-4d57-82b0-fa4678cab96e 
# 绝密行动 (Secret Mission)

A multiplayer hidden-identity card game for the web, inspired by 风声 (The Message). Players are secret agents belonging to rival factions, using a unified deck of cards that serve dual purposes — play them for powerful actions, or pass them face-down as intelligence. The tension of choosing how to use each card is the core of the game.

## Quick Start

```bash
pip install aiohttp
python server.py
```

Open `http://localhost:8080` in a browser. Create a room, share the room code with friends, and start the game when everyone has joined.

## How to Play

### Factions & Winning

- **潜伏战线 (Resistance)**: Any Resistance member collects 3 red intelligence cards → team wins
- **特工机关 (Agency)**: Any Agency member collects 3 blue intelligence cards → team wins
- Identities are secret. Dead teammates still share the victory.

### Card Anatomy

Every card has two identities:

| Aspect | Description |
|--------|-------------|
| **Intelligence Color** | Red / Blue / Black — determines win/death when received as intel |
| **Action Function** | A named ability (Probe, Intercept, Clarify, etc.) — used when played from hand |

A card can only be used **one way** per turn: play it for its action, or send it as intelligence.

### Turn Phases

1. **摸牌 (Draw)** — Draw 3 cards
2. **出牌 (Action)** — Play action-phase cards (Probe, Coerce, Clarify, Secret Order) or skip
3. **传递 (Transmission)** — Must send 1 hand card face-down as intelligence in a direction (left/right)
4. **争夺 (Contention)** — Once someone accepts, all players may play contention cards (Intercept, Switch, Decoy, Burn, Return)
5. **接收 (Reception)** — Intel is flipped face-up into the receiver's area. Check for win or death.

### Death

Collecting 3 black intelligence triggers dying. Other players may play Clarify to save you. If no one does, you die and may gift up to 3 hand cards to one living player.

### Card Types

| Card | Phase | Effect |
|------|-------|--------|
| 试探 Probe | Action | Look at a player's identity (played face-down) |
| 威逼 Coerce | Action | Take 1 card from a player's hand (played face-down) |
| 澄清 Clarify | Action/Dying | Remove 1 black intel from a player |
| 密令 Secret Order | Action | Draw 1 extra card (has Lock attribute) |
| 截获 Intercept | Contention | You become the intel receiver |
| 调包 Switch | Contention | Swap the intel card with one from your hand |
| 误导 Decoy | Contention | Reverse the intel's travel direction |
| 烧毁 Burn | Contention | Peek at intel; discard it if color matches receiver's area |
| 退回 Return | Contention | Send intel back to the original sender |

## Project Structure

```
fengsheng/
├── server.py          # aiohttp HTTP + WebSocket server, room management
├── game_logic.py      # Pure game state machine (no I/O)
├── cards.py           # Card deck + identity definitions
├── requirements.txt   # aiohttp
├── index.html         # Single-page app shell
├── static/
│   ├── css/
│   │   ├── base.css       # Reset, variables, layout, animations
│   │   ├── cards.css      # Card rendering (dual-purpose design)
│   │   ├── table.css      # Player avatars in semi-elliptical arc
│   │   ├── stage.css      # Phase bar, intel slot, action buttons
│   │   └── cockpit.css    # Hand fan, intel bar
│   └── js/
│       ├── main.js        # Entry point
│       ├── state.js       # Client state store (pub/sub)
│       ├── ws.js          # WebSocket connection manager
│       ├── lobby.js       # Room create/join UI
│       ├── render.js      # Game rendering + message handler
│       └── actions.js     # User interaction handlers
├── game_design.md     # Detailed design document
└── rule_of_game.md    # Game rules reference (Chinese)
```

## Architecture

- **Server-authoritative**: All game rules are enforced in `game_logic.py`. The client is a renderer.
- **Information hiding**: The server never sends other players' hand cards (only counts), identity cards (until game over), or face-down intel colors. Enforced by `GameState.get_state_for_player()`.
- **Event-driven**: Every game action returns a list of events with targets. The server routes each event to the correct WebSocket(s).
- **No build tools**: Vanilla ES modules, no npm/webpack/transpiling.
- **Reconnection**: On WebSocket reconnect, the server sends a full state sync of all visible information.

## Tech Stack

- **Backend**: Python 3, aiohttp (single dependency)
- **Frontend**: HTML5, CSS, ES modules
- **Communication**: WebSocket with JSON messages

## Deck Composition

54 cards total, evenly distributed: 18 red, 18 blue, 18 black.

Directions are split roughly 1/3 left, 1/3 right, 1/3 any. Cards with the Lock attribute (密令 and a few others) allow the sender to designate a player who must accept the intelligence. Cards with the Hidden attribute (试探, 威逼) are played face-down.

## V1 Scope

- Resistance vs Agency only (no Mystics)
- 2-8 players (5-8 recommended for balance)
- Identity distribution: roughly 50/50 split between factions
