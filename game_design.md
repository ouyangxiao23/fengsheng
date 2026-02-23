# 绝密行动 (Secret Mission) - Game Design Document

## 1. Game Overview (Refined Rules)

**Genre**: Hidden Identity / Card Battler / Social Deduction
**Players**: 5-8 (Recommended)
**Platform**: Mobile Web (Touch optimized)

### 1.1 Core Concept
Players act as agents belonging to three opposing factions. The game uses a **single unified deck** — every card has both an **Action function** (e.g., Intercept, Probe, Clarify) and an **Intelligence color** (Red, Blue, or Black). A card can be played for its action effect *or* passed face-down as intelligence, but not both — choosing how to use each card is the core tension.

The objective is to collect cards of your faction's intelligence color in your Intelligence Area, while using action abilities to manipulate, intercept, and deceive.

### 1.2 Factions & Winning Conditions
*   **🔴 The Resistance (潜伏战线)**: Team wins if *any* Resistance member collects **3 cards with Red intelligence color** in their Intelligence Area.
*   **🔵 The Agency (特工机关)**: Team wins if *any* Agency member collects **3 cards with Blue intelligence color** in their Intelligence Area.
*   **🟢 The Mystics (神秘人)**: Individual win conditions (varies by identity card, e.g., "Survival", "collect specific cards").

### 1.3 Setup
1.  **Identity Distribution**: Hidden identities are dealt facedown.
    *   *Note*: In 6/8 player games, extra Mystic cards are shuffled in to add uncertainty.
2.  **Starting Hand**: 3 cards per player from the shared deck.
3.  **Turn Order**: Determined by random "Priority Token" (e.g., player with the poem card goes first), proceeds counter-clockwise.

### 1.4 Card Anatomy (Unified Deck)
Every card in the shared deck has **two aspects**:
*   **Intelligence Color**: Red 🔴, Blue 🔵, or Black ⚫ — this is the card's identity when it sits in a player's Intelligence Area. It determines win/death conditions.
*   **Action Function**: A named ability (e.g., *Probe*, *Intercept*, *Clarify*) with a specific phase restriction (playable during "Action Phase" or "Contention Phase") — this is the card's identity when played from hand for its effect.

A single card can only be used **one way** per turn: either played for its action, or sent as intelligence. This creates constant tension — a powerful action card might also be the intelligence color you desperately need (or desperately want to avoid receiving).

**Card Attributes:**
*   **Direction Arrow** (↙ Left / ↘ Right / ↕ Any): Determines which way the card travels when sent as intelligence.
*   **Lock Icon** 🔒: If present, the sender can designate a specific player who *must* accept the intelligence.
*   **Hidden Icon** 🙈: If present, the action card must be played face-down.

### 1.5 Turn Phases
Each player's turn consists of 5 strict phases:

1.  **Draw Phase**: Draw **3 cards** from the deck.
2.  **Action Phase**:
    *   Player may play any number of hand cards for their **action function**, if the card is marked "Action Phase" (e.g., *Probe*, *Coerce*).
    *   *Hidden Actions*: Cards with the 🙈 icon are played face-down.
    *   Used action cards go to the discard pile.
3.  **Transmission Phase (Mandatory)**:
    *   Player **MUST** choose 1 hand card and send it **face-down** as intelligence.
    *   The card's **intelligence color** (not its action) is what matters — it will be revealed when received.
    *   **Direction**: Follows the card's direction arrow (Left / Right / Any).
    *   **Targeting**: If the card has the 🔒 Lock icon, sender designates a player who *must* accept.
    *   Players along the path may choose to "accept" or "pass along" the intelligence.
    *   If the intelligence circles back to the sender, they must accept it themselves.
    *   *Failure penalty*: If a player has **no hand cards** to transmit, they are immediately **Eliminated**.
4.  **Contention Phase**:
    *   Once a player declares they will accept the intelligence, all players may play hand cards marked "Contention Phase" for their **action function** (e.g., *Intercept*, *Switch*).
    *   Players take turns deciding whether to play contention cards, until all pass.
5.  **Reception Phase**:
    *   The intelligence card is **flipped face-up** and placed in the receiver's **Intelligence Area**. Its intelligence color is now public.
    *   **Win Check**: Immediately check if this triggers a Win Condition (3 Red or 3 Blue of matching faction).
    *   **Death Check**: If the receiver now has **3 Black intelligence cards**, they enter "Dying State".

### 1.6 Death & Elimination
*   **Trigger**: Collecting 3 cards with Black intelligence color in Intelligence Area.
*   **Rescue**: Starting from the current player, going counter-clockwise, each player is asked whether they will play a *Clarify* card (using its action function). If someone does and it removes a black card, the player survives. If no one helps, the player **dies**.
*   **Death Rattle**:
    1.  Dying player may gift up to 3 hand cards to *one* other living player.
    2.  Remaining hand cards and all Intelligence Area cards are discarded face-up.
    3.  **Identity remains hidden.**
*   **Ghost Win**: Resistance/Agency players share the team victory even after death.

---

## 2. Mobile UI/UX Design

**Design Philosophy**: "Clean Information, High Tension." 
Since the game involves complex text reading and table status tracking, the UI must avoid clutter.

### 2.1 Visual Style
*   **Theme**: Noir / Spy Thriller. Dark background (slate grey/black) with neon accents (Red/Blue/Green) for factions.
*   **Font**: Monospaced for data/stats, Serif for story elements.
*   **Assets**: SVG-based icons for scalability (similar to the Gobang implementation).

### 2.2 Screen Layout (Portrait Mode)

We prioritize Portrait mode for one-handed play.

#### A. The "Table" (Top 40% of Screen)
This area visualizes the other players.
*   **Layout**: A semi-circle or hexagonal grid of Player Avatars at the top.
*   **Avatar Components**:
    *   **Portrait**: Character image (greyscale by default, colored if dead/revealed).
    *   **Status Badges**:
        *   🃏 **Hand Count**: Number icon (e.g., "x3").
        *   💼 **Intel Track**: Mini-pip indicators below avatar showing received intelligence colors:
            *   🔴 (Red count) | 🔵 (Blue count) | ⚫ (Black count) — all public info since received cards are flipped face-up.
    *   **Active Indicator**: Glowing border around the current turn player.
    *   **Interaction**: Tap avatar to target (for actions like "Lock on Player").

#### B. The "Stage" (Middle 20% of Screen)
The active area where events happen.
*   **Transmission Stream**: When Intel is being passed, the card appears here, moving physically from Sender Avatar towards Receiver.
*   **Action Prompts**: Large, context-sensitive buttons appear here overlaying the stage.
    *   `[ RECEIVE ]` `[ REJECT (Left) ]` `[ REJECT (Right) ]`
    *   `[ INTERCEPT ]` (Only appears during Contention phase if holding valid card).

#### C. The "Cockpit" (Bottom 40% of Screen)
The player's personal control center.
*   **My Intel**: A compact bar showing my own Red/Blue/Black count.
*   **Hand Cluster**:
    *   Cards fan out at the bottom.
    *   **Gesture Control**:
        *   **Tap**: Inspect card (Pop-up with full text).
        *   **Drag Up**: Play card / Transmit Intel.
*   **Information Toggle**: A small tab to slide up a "Game Log" to review past actions.

### 2.3 Key Interaction Flows

#### 1. Transmitting Intelligence
*   **Prompt**: "Select Intelligence to Send."
*   **Action**: Player drags a card from hand to the "Stage".
*   **Direction**: Arrows appear on Left/Right of screen. Player swipes the card to the desired direction.

#### 2. Receiving/Passing
*   **Visual**: The card hovers in the center. An animated path shows where it came from and where it goes next if rejected.
*   **Decision**: 
    *   Tap card to see "text" (if open information).
    *   Swipe **Down** to `[ RECEIVE ]`.
    *   Swipe **Side** to `[ PASS ]`.

#### 3. Combating for Intel (Contention)
*   When a card is being passed, a "Interruption Window" timer (e.g., 5s countdown) appears at the top.
*   Relevant cards in hand (e.g., *Intercept*) glow.
*   Tapping the glowing card pauses the timer and acts immediately.

### 2.4 Mobile Optimization Specifics
*   **Text Readability**: Card text is often small. Implement "Long Press to Zoom" on any card (in hand or on table).
*   **Colorblind Mode**: Use distinct shapes for Intelligence colors (e.g., Red = Triangle, Blue = Circle, Black = Cross) in addition to color.
*   **Battery Saver**: Avoid complex WebGL; use CSS animations and SVGs (as per Gobang tech stack).

### 2.5 Tech Stack Implementation (Gobang-style)
*   **Frontend**: Native HTML5 + CSS (inspired by UNO implementation) + JavaScript.
    *   **CSS Styling**: 
        *   Use CSS for Card Rendering (no image assets for cards).
        *   `.card` container with specific dimensions (e.g., 85px x 132px).
        *   Inner colors defined by classes (e.g., `.card-red`, `.card-blue`, `.card-black`).
        *   Central symbol/text overlay using absolute positioning and SVG/text.
    *   **Layout**:
        *   `Flexbox` for main layout (column direction).
        *   `Absolute` positioning for Table/Avatar placement (circular arrangement).
        *   `Transform` (scale/rotate) for the hand of cards to create a fanning effect.
    *   `WebSocket`: Real-time state syncing (Phase transitions, card movements).
*   **Backend**: Python (Daphne/Channels) handling the state machine (Phases, Turn Order, Deck Management).

### 3. Detailed UI Specs (Reference: UNO)

Based on the analysis of `game.hullqin.cn/uno`, we will adopt the following highly efficient UI patterns:

#### 3.1 Avatar & Status System
Instead of static images, we use a CSS-heavy "Seat" component:
*   **Avatar**: A `w-14 h-14` (approx 56px) rounded div. Statuses are indicated by:
    *   **Border**: `border-2 border-green-500` (Active Turn).
    *   **Badges**: Small absolute positioned pills for "Host" or "ID #".
    *   **Connection**: A tiny dot (Green/Gray) to show online status.
*   **Reactions**: Floating Emoji bubbles (e.g., 😭, 🤔) that appear near the avatar for non-verbal communication.
*   **Hand Count**: A clearly visible number (e.g., "7") next to a mini-card icon, crucial for determining threat levels.

#### 3.2 Card Engineering (Pure CSS, Dual-Purpose Design)
Every card must clearly communicate **two identities**: its intelligence color and its action function.
*   **Dimensions**: Base size `85px x 132px` (Ratio ~0.64).
*   **Scaling**: Scaled down using `transform: scale(0.5)` for hand cards and `scale(0.3)` for Intelligence Area to fit mobile screens.
*   **Card Front Composition**:
    *   `.card-bg`: Background color = **intelligence color** (`bg-red-500` / `bg-blue-500` / `bg-gray-800`). This is the dominant visual — you can tell a card's intel color at a glance.
    *   `.card-action-name`: Top banner showing the action name (e.g., "截获 Intercept", "试探 Probe").
    *   `.card-icon`: Central big emoji/icon for the action (e.g., 🛡️ for Clarify, 🎯 for Lock, 🔄 for Switch).
    *   `.card-phase-tag`: Small tag indicating when the action can be played: "出牌阶段" (Action Phase) or "争夺阶段" (Contention Phase).
    *   `.card-direction`: Arrow icon in corner showing intelligence direction (↙ / ↘ / ↕).
    *   `.card-lock`: 🔒 icon if the card has the Lock attribute.
    *   `.card-corner`: Top-left and bottom-right corners repeat the intel color pip for quick scanning in a fanned hand.
*   **Card Back**: Uniform design (no information revealed) — critical since intelligence is sent face-down.

#### 3.3 The Hand (Fanned Layout)
*   **Container**: `overflow-x: auto` allows scrolling if the hand is huge.
*   **Positioning**: Cards use **absolute positioning** within the container.
    *   We calculate `left` offset dynamically: `index * overlap_width`.
    *   `z-index`: Lower index cards are below higher index cards.
*   **Visual Feedback**:
    *   **Selected**: `transform: translateY(-20px)` to indicate selection.
    *   **Playable**: Add a glow effect to cards that can act in the current phase (e.g., "Interruption" cards during Contention).

#### 3.4 Floating Feedback (Micro-interactions)
*   **Resource Change**: When a player gains/loses a card (Intel or Hand), a floating text animation (`+1` in Red, `-1` in Green) spawns from their avatar and fades out.
*   **Direction Indicator**: A central arrow icon (`clip-path` animated) clearly shows the current direction of intelligence transmission (Clockwise/Counter-clockwise).

#### 3.5 The "Stage" (Center Area)
*   **Active Intel**: The card currently being transmitted sits in the absolute center, shown **face-down** (card back visible). No one knows the intelligence color until it is received and flipped.
*   **Transmission Path**: Animated trail showing the card's journey from sender through each player along the direction.
*   **Action Buttons**: Context-sensitive buttons appear *below* the central card, easily reachable by thumb:
    *   During Transmission: `[ ACCEPT ]` `[ PASS ]` (for the player the card is currently facing)
    *   During Contention: `[ PLAY CARD ]` (for all players holding valid contention-phase cards)
