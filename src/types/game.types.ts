// Suits and values for the Spanish deck used in Caída
export type Suit = "oros" | "copas" | "espadas" | "bastos";
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  id: string; // e.g. "7-oros"
  value: CardValue;
  suit: Suit;
}

export type PlayerStatus = "connected" | "disconnected" | "away";

export interface PlayerPresence {
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: PlayerStatus;
  joinedAt: string;
}

export interface TablePresenceState {
  [key: string]: PlayerPresence[];
}

export type GamePhase =
  | "waiting"    // Waiting for players to join
  | "betting"    // Players placing bets
  | "dealing"    // Dealing cards
  | "playing"    // Active play
  | "scoring"    // Counting scores
  | "finished";  // Game over

export interface GameState {
  tableId: string;
  phase: GamePhase;
  pot: number;
  currentTurn: string | null; // userId whose turn it is
  players: GamePlayer[];
  tableCards: Card[]; // Cards on the table (mesa)
  roundNumber: number;
}

export interface GamePlayer {
  userId: string;
  username: string;
  avatarUrl: string | null;
  hand: Card[];
  score: number;
  capturedCards: Card[];
  hasPlacedBet: boolean;
}

// Presence channel payload (Broadcast)
export interface BroadcastPayload<T = unknown> {
  event: string;
  payload: T;
}
