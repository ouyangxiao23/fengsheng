# 绝密行动 (Secret Mission) - Game Design Document

## 1. Game Overview (Refined Rules)

**Genre**: Hidden Identity / Card Battler / Social Deduction
**Players**: 5-8 (Recommended)
**Platform**: Mobile Web (Touch optimized)

### 1.1 Core Concept
Players act as agents belonging to three opposing factions. The objective is to collect Intelligence cards of your faction's color or fulfill a secret mission, while navigating a web of deceit, passing false intelligence, and intercepting critical messages.

### 1.2 Factions & Winning Conditions
*   **🔴 The Resistance (潜伏战线)**: Team wins if *any* Resistance member collects **3 Red Intelligence** cards.
*   **🔵 The Agency (特工机关)**: Team wins if *any* Agency member collects **3 Blue Intelligence** cards.
*   **🟢 The Mystics (神秘人)**: Individual win conditions (varies by role card, e.g., "Survival", "collect specific cards").

### 1.3 Setup
1.  **Identity Distribution**: Hidden identities are dealt facedown.
    *   *Note*: In 6/8 player games, extra Mystic cards are shuffled in to add uncertainty.
2.  **Starting Hand**: 3 cards per player.
3.  **Turn Order**: Determined by random "Priority Token" (e.g., player with the poem card goes first), proceeds counter-clockwise.

### 1.4 Turn Phases
Each player's turn consists of 5 strict phases:

1.  **Draw Phase**: Draw 2 cards from the deck.
2.  **Action Phase**:
    *   Player may play "Action" type cards (e.g., *Probe*, *Coerce*).
    *   *Hidden Actions*: Some cards are played facedown.
3.  **Transmission Phase (Mandatory)**:
    *   Player **MUST** choose 1 card from hand to send as Intelligence.
    *   **Direction**: Choose to send Left or Right (unless card specifies otherwise).
    *   **Targeting**: If card has "Lock" attribute, sender specifies a mandatory receiver.
    *   *Failure penalty*: If a player has no cards to transmit, they are immediately **Eliminated**.
4.  **Contention Phase**:
    *   While the Intelligence is travelling, other players may play "Interruption" cards (e.g., *Intercept*, *Switch*).
    *   This is a "stack" based interaction where players vie for the intelligence.
5.  **Reception Phase**:
    *   If a player accepts (or is forced to accept) the Intelligence, it is revealed and placed in their **Intelligence Area**.
    *   **Win Check**: Check immediately if the new card triggers a Win Condition.
    *   **Death Check**: If a player has **3 Black Intelligence**, they enter "Dying State".

### 1.5 Death & Elimination
*   **Trigger**: Collecting 3 Black Intelligence cards.
*   **Rescue**: Dying player asks for a *Clarify* cure card. If none played, player dies.
*   **Death Rattle**: 
    1.  Dying player may gift up to 3 hand cards to *one* other player.
    2.  Remaining hand and Intelligence cards are discarded.
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
        *   💼 **Intel Track**: Mini-pip indicators below avatar:
            *   🔴 (Red count) | 🔵 (Blue count) | ⚫ (Black count)
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

#### 3.2 Card Engineering (Pure CSS)
We will replicate the asset-free card design:
*   **Dimensions**: Base size `85px x 132px` (Ratio ~0.64).
*   **Scaling**: This base size is scaled down using `transform: scale(0.5)` for hand cards and `scale(0.3)` for table history to fit mobile screens.
*   **Composition**:
    *   `.card-bg`: A skewed white oval (`rotate(30deg)`) creates the classic card look.
    *   `.card-icon`: Central big emoji/text (e.g., 🛡️ for Defend, 🎯 for Lock).
    *   `.card-corner`: Small number/icon in top-left/bottom-right.
    *   **Colors**: defined by utility classes `.bg-red-500`, `.bg-blue-500`, `.bg-gray-800`.

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
*   **Active Intel**: The card currently being transmitted sits in the absolute center.
*   **Action Buttons**: Context-sensitive buttons (RECEIVE / PASS) appear *below* this central card, easily reachable by thumb.
