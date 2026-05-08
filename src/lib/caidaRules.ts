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
  limpieza: 1,
  trivilin12: 24,
  casaGrande: 12,
  casaChica: 11,
  registrico: 10,
  maguaro: 9,
  registro: 8,
  vigia: 7,
  patrulla: 6,
  trivilin: 5,
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
  if (hand.length !== 3) return [];
  
  const values = hand.map(c => c.value);
  const counts = new Map<CardValue, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  // Trivilín de 12 (12-12-12)
  if (counts.get(12) === 3) return [{ type: "trivilin12", cards: hand }];
  
  // Casa Grande (1-12-12)
  if (counts.get(1) === 1 && counts.get(12) === 2) return [{ type: "casaGrande", cards: hand }];
  
  // Casa Chica (1-11-11)
  if (counts.get(1) === 1 && counts.get(11) === 2) return [{ type: "casaChica", cards: hand }];
  
  // Registrico (1-10-11)
  if (counts.has(1) && counts.has(10) && counts.has(11)) return [{ type: "registrico", cards: hand }];
  
  // Maguaro (1-10-12)
  if (counts.has(1) && counts.has(10) && counts.has(12)) return [{ type: "maguaro", cards: hand }];
  
  // Registro (1-11-12)
  if (counts.has(1) && counts.has(11) && counts.has(12)) return [{ type: "registro", cards: hand }];
  
  // Patrulla: 3 consecutivos
  const sortedValues = [...values].sort((a, b) => valueIndex(a) - valueIndex(b));
  if (valueIndex(sortedValues[1]) === valueIndex(sortedValues[0]) + 1 &&
      valueIndex(sortedValues[2]) === valueIndex(sortedValues[1]) + 1) {
    return [{ type: "patrulla", cards: hand }];
  }

  // Vigía y Trivilín estándar
  let hasPair = false;
  let pairValue: CardValue | null = null;
  let singleValue: CardValue | null = null;
  
  for (const [v, c] of counts.entries()) {
    if (c === 3) {
      // Trivilín estándar (3 iguales, excepto el 12 que ya se validó)
      return [{ type: "trivilin", cards: hand }];
    }
    if (c === 2) { hasPair = true; pairValue = v; }
    else if (c === 1) { singleValue = v; }
  }
  
  // Evaluar Vigía o Ronda (par + adyacente o par + distinto)
  if (hasPair && pairValue !== null && singleValue !== null) {
    const pIdx = valueIndex(pairValue);
    const sIdx = valueIndex(singleValue);
    if (Math.abs(pIdx - sIdx) === 1) {
      return [{ type: "vigia", cards: hand }];
    } else {
      return [{ type: "ronda", cards: hand }];
    }
  }

  return [];
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
      if (event.cardValue === 12) return 4;
      if (event.cardValue === 11) return 3;
      if (event.cardValue === 10) return 2;
      return 1;
    case "limpieza":
      return POINTS.limpieza;
    case "canto":
      if (event.canto.type === "ronda") {
        const pairCard = event.canto.cards.find((c, idx, arr) => arr.filter(x => x.value === c.value).length === 2);
        if (!pairCard) return 0;
        if (pairCard.value === 12) return 4;
        if (pairCard.value === 11) return 3;
        if (pairCard.value === 10) return 2;
        return 1;
      }
      return POINTS[event.canto.type] ?? 0;
    case "mayorCartas":
      // +1 point per each card collected over 20
      return Math.max(0, event.extraCards - 20);
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
