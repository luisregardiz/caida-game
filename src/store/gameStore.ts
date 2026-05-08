import { create } from "zustand";
import type { GameState, GamePhase, PlayerPresence } from "@/types/game.types";

interface GameStore {
  // Table presence (who is online in this room)
  connectedPlayers: PlayerPresence[];
  setConnectedPlayers: (players: PlayerPresence[]) => void;

  // Game state (synced via Supabase Realtime Broadcast)
  gameState: GameState | null;
  setGameState: (state: GameState | null) => void;
  updatePot: (amount: number) => void;
  updatePhase: (phase: GamePhase) => void;

  // UI helpers
  isGameLoading: boolean;
  setGameLoading: (loading: boolean) => void;

  // Reset
  resetGame: () => void;
}

const initialState = {
  connectedPlayers: [],
  gameState: null,
  isGameLoading: false,
};

/**
 * Zustand store for active game state and real-time presence.
 * NOT persisted — resets when navigating away from the table.
 */
export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setConnectedPlayers: (players) => set({ connectedPlayers: players }),

  setGameState: (gameState) => set({ gameState }),

  updatePot: (amount) =>
    set((state) =>
      state.gameState
        ? { gameState: { ...state.gameState, pot: state.gameState.pot + amount } }
        : {}
    ),

  updatePhase: (phase) =>
    set((state) =>
      state.gameState ? { gameState: { ...state.gameState, phase } } : {}
    ),

  setGameLoading: (isGameLoading) => set({ isGameLoading }),

  resetGame: () => set(initialState),
}));
