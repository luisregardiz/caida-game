// =============================================================================
// CAÍDA — Core Domain Types
// =============================================================================
// These types describe the game engine only.
// UI / Supabase / Presence types live in game.types.ts.
// =============================================================================

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** The four suits of a Spanish 40-card deck. */
export type Suit = "oros" | "copas" | "espadas" | "bastos";

/**
 * Valid card face values.
 * Note: 8 and 9 do not exist in a Spanish deck.
 * The sequence order for consecutives is: 1-2-3-4-5-6-7-10-11-12.
 */
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

/** A single card. The `id` is the canonical unique key (e.g. "7-oros"). */
export interface Card {
  id: string;
  suit: Suit;
  value: CardValue;
}

// ---------------------------------------------------------------------------
// Game-level aggregates
// ---------------------------------------------------------------------------

/** Which "cantos" (announcements) a player may hold at the start of a round. */
export type CantoType = "trivilin12" | "casaGrande" | "casaChica" | "registrico" | "maguaro" | "registro" | "vigia" | "patrulla" | "trivilin" | "ronda";

/** A canto the engine detected in a player's hand. */
export interface Canto {
  type: CantoType;
  /** Cards involved in the canto */
  cards: Card[];
}

// ---------------------------------------------------------------------------
// In-flight play result types (returned by pure functions)
// ---------------------------------------------------------------------------

/**
 * Outcome produced by `calculateCapture`.
 * - `captured`   – the cards the player takes off the table
 * - `tableAfter` – table state after the capture (or after placing the card)
 * - `isLimpieza` – true when the table is empty after the play
 */
export interface CaptureResult {
  captured: Card[];
  tableAfter: Card[];
  isLimpieza: boolean;
}

/**
 * Metadata attached to each "play" event stored in the engine.
 * Used by `checkCaida` and scoring.
 */
export interface LastPlay {
  playerId: string;
  card: Card;
  /** true when the card was placed on the table without capturing anything */
  wentToTable: boolean;
}

// ---------------------------------------------------------------------------
// Scoring events  (fed into `calculatePoints`)
// ---------------------------------------------------------------------------

export type PointEvent =
  | { type: "caida"; forPlayerId: string; cardValue: CardValue }
  | { type: "limpieza"; forPlayerId: string }
  | { type: "canto"; forPlayerId: string; canto: Canto }
  | { type: "mayorCartas"; forPlayerId: string; extraCards: number };

// ---------------------------------------------------------------------------
// Player state inside the engine
// ---------------------------------------------------------------------------

export interface EnginePlayer {
  id: string;
  hand: Card[];
  captured: Card[];
  /** Running point total for this game (target: 24 to win). */
  score: number;
  /** Cantos declared this round (populated at deal time). */
  cantos: Canto[];
}

// ---------------------------------------------------------------------------
// Full engine state (lives in gameLogicStore)
// ---------------------------------------------------------------------------

export type RoundPhase =
  | "idle"       // No game in progress
  | "dealing"    // Cards being distributed
  | "playing"    // Players playing cards
  | "scoring"    // Tallying round points
  | "tanda_end"  // 40 cards exhausted, waiting for user to start next tanda
  | "finished";  // A player has reached 24 points

export interface EngineState {
  /** Cards not yet dealt (draw pile). */
  deck: Card[];
  /** Cards currently on the table ("la sopa"). */
  tableCards: Card[];
  players: EnginePlayer[];
  /** userId of whoever must play next. */
  currentTurn: string | null;
  /** The most recent play (needed to detect Caída). */
  lastPlay: LastPlay | null;
  /** Current round within the hand (resets when deck runs out). */
  round: number;
  phase: RoundPhase;
  /** userId of the player who won the game, once phase === "finished". */
  winnerId: string | null;
  /** userId of the player who dealt the current 40-card deck. */
  dealerId: string | null;
}
