/**
 * lib/caidaRules.ts
 * =============================================================================
 * PURE FUNCTIONS — zero side effects, zero imports from React / Zustand.
 * Every function here is independently unit-testable.
 * =============================================================================
 */

import type {
  Card,
  CardValue,
  Suit,
  CaptureResult,
  LastPlay,
  PointEvent,
  Canto,
  CantoType,
} from "@/types/caida.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All suits in the Spanish deck. */
const SUITS: Suit[] = ["oros", "copas", "espadas", "bastos"];

/**
 * All valid card values, **in ascending sequence order**.
 * The gap between 7 and 10 is intentional — 8 and 9 do not exist.
 * This array is the single source of truth for consecutive-sequence logic.
 */
const CARD_VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/** Points awarded per event type. */
const POINTS: Record<string, number> = {
  caida: 2,
  limpieza: 1,
  vigia: 1,
  patrulla: 2,
  ronda: 3,
  mayorCartas: 1, // Base point; extra cards yield additional points per card
};

// ---------------------------------------------------------------------------
// 1. Deck generation & shuffle
// ---------------------------------------------------------------------------

/**
 * Builds a full, unshuffled Spanish 40-card deck.
 * Card IDs follow the pattern `"{value}-{suit}"` (e.g. `"7-oros"`).
 */
export function generateDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of CARD_VALUES) {
      deck.push({ id: `${value}-${suit}`, suit, value });
    }
  }
  return deck; // 40 cards
}

/**
 * Fisher-Yates shuffle — returns a NEW shuffled array (does not mutate).
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// 2. Dealing helpers
// ---------------------------------------------------------------------------

/**
 * Deals `count` cards from the top of `deck`.
 * Returns the dealt cards and the remaining deck as separate arrays.
 */
export function dealCards(
  deck: Card[],
  count: number
): { dealt: Card[]; remaining: Card[] } {
  if (count > deck.length) {
    throw new RangeError(
      `Cannot deal ${count} cards from a deck of ${deck.length}.`
    );
  }
  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

// ---------------------------------------------------------------------------
// 3. Sequence helpers (core of the capture logic)
// ---------------------------------------------------------------------------

/**
 * Returns the index of a value within CARD_VALUES, or -1 if not found.
 * Used to determine adjacency for consecutive-sequence captures.
 */
function valueIndex(value: CardValue): number {
  return CARD_VALUES.indexOf(value);
}

/**
 * Given a starting value and a set of table cards, returns the longest
 * chain of cards whose values form an unbroken consecutive sequence
 * **starting at** `startValue` (inclusive).
 *
 * Example: table has [4, 5, 6, 10], startValue = 4 → returns [4, 5, 6].
 * (10 is not consecutive to 7 in terms of sequence; 10 follows 7.)
 *
 * The chain walk follows the CARD_VALUES order, so 7→10 is consecutive.
 *
 * @param startValue  The value at which the chain begins.
 * @param tableCards  Current cards on the table.
 * @returns           Array of matched table cards in sequence order.
 */
function findConsecutiveChain(
  startValue: CardValue,
  tableCards: Card[]
): Card[] {
  const chain: Card[] = [];

  let idx = valueIndex(startValue);
  if (idx === -1) return chain;

  // Walk the sequence forward from startValue
  while (idx < CARD_VALUES.length) {
    const currentValue = CARD_VALUES[idx];
    const matchInTable = tableCards.find((c) => c.value === currentValue);

    if (!matchInTable) break; // Chain is broken — stop

    chain.push(matchInTable);
    idx++;
  }

  return chain;
}

// ---------------------------------------------------------------------------
// 4. Capture calculation
// ---------------------------------------------------------------------------

/**
 * Determines what happens when `playedCard` is thrown onto the table.
 *
 * Rules implemented:
 *  a) If the played card's value matches one or more table cards → capture
 *     the matching card(s) plus any consecutive chain that extends upward.
 *  b) If no match → the played card is added to the table.
 *  c) isLimpieza = true when the table is empty after the play.
 *
 * @param playedCard  The card the player is playing.
 * @param tableCards  Current cards on the table before this play.
 * @returns           CaptureResult with captured cards and new table state.
 */
export function calculateCapture(
  playedCard: Card,
  tableCards: Card[]
): CaptureResult {
  // Find all table cards that share the played card's value
  const directMatches = tableCards.filter((c) => c.value === playedCard.value);

  if (directMatches.length === 0) {
    // No match — card goes to the table
    return {
      captured: [],
      tableAfter: [...tableCards, playedCard],
      isLimpieza: false,
    };
  }

  // When multiple cards share the same value (shouldn't happen in a standard
  // game, but handled defensively), capture all of them.
  // Build the consecutive chain starting from the played card's value.
  const chain = findConsecutiveChain(playedCard.value, tableCards);

  // `chain` already includes the direct match(es). All cards in the chain
  // are captured together with the played card.
  const capturedIds = new Set(chain.map((c) => c.id));
  const tableAfter = tableCards.filter((c) => !capturedIds.has(c.id));

  return {
    captured: [playedCard, ...chain], // played card + table cards taken
    tableAfter,
    isLimpieza: tableAfter.length === 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Caída detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the current play triggers a "Caída" on the previous
 * player.
 *
 * Conditions for a Caída:
 *  1. There WAS a previous play.
 *  2. The previous play put a card on the table (did NOT capture anything).
 *  3. The current player is DIFFERENT from the previous player.
 *  4. The played card has the SAME VALUE as the card placed on the table.
 *
 * @param playedCard  The card being played now.
 * @param lastPlay    The most recent recorded play (may be null).
 * @param currentPlayerId  The ID of the player making this play.
 * @returns `true` if a Caída is scored.
 */
export function checkCaida(
  playedCard: Card,
  lastPlay: LastPlay | null,
  currentPlayerId: string
): boolean {
  if (!lastPlay) return false;
  if (!lastPlay.wentToTable) return false;
  if (lastPlay.playerId === currentPlayerId) return false;
  return playedCard.value === lastPlay.card.value;
}

// ---------------------------------------------------------------------------
// 6. Canto detection
// ---------------------------------------------------------------------------

/**
 * Detects cantos (special announcements) in a player's opening hand of 3 cards.
 *
 * - **Vigía**    → 2 cards with the same value
 * - **Patrulla** → 3 cards with the same value
 * - **Ronda**    → 3 cards with consecutive values (using CARD_VALUES order)
 *
 * A hand can have at most one canto (the highest one wins if multiple apply).
 * Priority order: Patrulla > Ronda > Vigía.
 */
export function detectCantos(hand: Card[]): Canto[] {
  const cantos: Canto[] = [];

  // --- Patrulla (3 same value) ---
  const valueGroups = groupByValue(hand);
  for (const [, cards] of valueGroups) {
    if (cards.length === 3) {
      cantos.push({ type: "patrulla" as CantoType, cards });
      return cantos; // Patrulla is the highest; no need to check further
    }
  }

  // --- Ronda (3 consecutive values) ---
  if (hand.length === 3) {
    const sorted = [...hand].sort(
      (a, b) => valueIndex(a.value) - valueIndex(b.value)
    );
    const [a, b, c] = sorted;
    const idxA = valueIndex(a.value);
    const idxB = valueIndex(b.value);
    const idxC = valueIndex(c.value);
    if (idxB === idxA + 1 && idxC === idxB + 1) {
      cantos.push({ type: "ronda" as CantoType, cards: sorted });
      return cantos;
    }
  }

  // --- Vigía (2 same value) ---
  for (const [, cards] of valueGroups) {
    if (cards.length === 2) {
      cantos.push({ type: "vigia" as CantoType, cards: cards.slice(0, 2) });
      break; // Only one vigía per hand
    }
  }

  return cantos;
}

/** Helper: groups cards by value. */
function groupByValue(cards: Card[]): Map<CardValue, Card[]> {
  const map = new Map<CardValue, Card[]>();
  for (const card of cards) {
    const existing = map.get(card.value) ?? [];
    map.set(card.value, [...existing, card]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 7. Round-end scoring
// ---------------------------------------------------------------------------

/**
 * Calculates points earned from a single scoring event.
 *
 * | Event         | Points                                               |
 * |---------------|------------------------------------------------------|
 * | caida         | +2 pts to scorer                                     |
 * | limpieza      | +1 pt to scorer                                      |
 * | vigia         | +1 pt                                                |
 * | patrulla      | +2 pts                                               |
 * | ronda         | +3 pts                                               |
 * | mayorCartas   | +1 pt base + 1 pt per card over 20 (if > 20 cards)  |
 *
 * @returns The number of points this event is worth.
 */
export function calculatePoints(event: PointEvent): number {
  switch (event.type) {
    case "caida":
      return POINTS.caida;
    case "limpieza":
      return POINTS.limpieza;
    case "canto":
      return POINTS[event.canto] ?? 0;
    case "mayorCartas":
      // +1 base for having the majority + 1 per each card over 20
      return POINTS.mayorCartas + Math.max(0, event.extraCards - 20);
    default:
      // Exhaustive check
      return 0;
  }
}

/**
 * Determines which player captured more cards at the end of a round and
 * returns the resulting PointEvents for "mayorCartas" (card majority).
 *
 * @param playerCaptures  Map of playerId → number of cards captured.
 * @returns               Array of PointEvents (0 or 1 entry).
 */
export function resolveMayorCartas(
  playerCaptures: Map<string, number>
): PointEvent[] {
  const entries = Array.from(playerCaptures.entries());
  if (entries.length < 2) return [];

  // Sort descending by card count
  entries.sort((a, b) => b[1] - a[1]);
  const [first, second] = entries;

  // Tie → no point awarded
  if (first[1] === second[1]) return [];

  return [
    {
      type: "mayorCartas",
      forPlayerId: first[0],
      extraCards: first[1],
    },
  ];
}

// ---------------------------------------------------------------------------
// 8. Win condition
// ---------------------------------------------------------------------------

/**
 * Returns the ID of the first player who has reached or exceeded 24 points,
 * or `null` if no player has won yet.
 */
export function checkWinCondition(
  playerScores: Map<string, number>
): string | null {
  for (const [playerId, score] of playerScores) {
    if (score >= 24) return playerId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------
export { CARD_VALUES, SUITS };
