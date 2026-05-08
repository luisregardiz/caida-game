"use client";
/**
 * hooks/useCaidaEngine.ts
 * =============================================================================
 * Orchestration hook: bridges `gameLogicStore` (local engine) with
 * the Supabase Realtime channel (remote sync).
 *
 * Responsibilities in the MVP:
 *  1. Initialise the engine with the players present in the room.
 *  2. Provide a `handlePlayCard` wrapper that:
 *       a) Calls `playCard` in the local store.
 *       b) Broadcasts the event over Supabase so the opponent's client syncs.
 *  3. Listens for opponent "PLAY_CARD" broadcasts and applies them locally.
 *  4. Exposes derived state conveniences (myHand, myScore, opponentScore…).
 *
 * IMPORTANT — single source of truth:
 *  The local engine runs optimistically. If a desync is detected (future work),
 *  the Supabase DB row for the table can be used to rehydrate the engine via
 *  `initGame`. For the MVP the host is effectively authoritative.
 * =============================================================================
 */

import { useEffect, useCallback, useRef } from "react";
import { createClient } from "@/config/supabase/client";
import { useGameLogicStore } from "@/store/gameLogicStore";
import { useGameStore } from "@/store/gameStore";
import { useUserStore } from "@/store/userStore";
import { generateDeck, shuffleDeck } from "@/lib/caidaRules";
import type { Card, PointEvent } from "@/types/caida.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Broadcast event shapes
// ---------------------------------------------------------------------------

interface PlayCardBroadcast {
  playerId: string;
  card: Card;
}

interface GameInitBroadcast {
  playerIds: string[]; // Ordered player IDs (determines turn order)
  deck: Card[];
  dealerId: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param tableId  The Supabase table (mesa) ID this game is running on.
 */
export function useCaidaEngine(tableId: string) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Store slices ──────────────────────────────────────────────────────────
  const { user } = useUserStore();
  const { connectedPlayers } = useGameStore();
  const {
    initGame,
    playCard,
    resetEngine,
    players,
    currentTurn,
    tableCards,
    phase,
    winnerId,
    lastPlay,
    round,
    dealerId,
  } = useGameLogicStore();

  // ── Derived conveniences ───────────────────────────────────────────────────
  const myPlayer = players.find((p) => p.id === user?.id) ?? null;
  const opponents = players.filter((p) => p.id !== user?.id);
  const isMyTurn = currentTurn === user?.id;

  // ── Channel setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tableId) return;

    const channel = supabase.channel(`game:${tableId}`);
    channelRef.current = channel;

    // Listen for opponent plays
    channel.on(
      "broadcast",
      { event: "PLAY_CARD" },
      ({ payload }: { payload: PlayCardBroadcast }) => {
        // Ignore our own reflected broadcasts
        if (payload.playerId === user?.id) return;

        try {
          playCard(payload.playerId, payload.card);
        } catch (err) {
          console.error("[useCaidaEngine] Failed to apply remote play:", err);
        }
      }
    );

    // Listen for game-init (host broadcasts this to sync player order)
    channel.on(
      "broadcast",
      { event: "GAME_INIT" },
      ({ payload }: { payload: GameInitBroadcast }) => {
        initGame(payload.playerIds, payload.deck, payload.dealerId);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      resetEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // ── Host: auto-start when 2 players are connected ─────────────────────────
  useEffect(() => {
    if (phase !== "idle") return;
    if (connectedPlayers.length < 2) return;
    if (!user) return;

    // Only the first connected player (by joinedAt) acts as host
    const sorted = [...connectedPlayers].sort((a, b) =>
      a.joinedAt.localeCompare(b.joinedAt)
    );
    const isHost = sorted[0].userId === user.id;
    if (!isHost) return;

    const playerIds = sorted.map((p) => p.userId);

    // Generate a single shuffled deck for both host and opponent
    const initialDeck = shuffleDeck(generateDeck());
    
    // Pick a random initial dealer
    const initialDealerId = playerIds[Math.floor(Math.random() * playerIds.length)];

    // Initialise locally
    initGame(playerIds, initialDeck, initialDealerId);

    // Broadcast to all participants so their engines start with the same order and same deck
    channelRef.current?.send({
      type: "broadcast",
      event: "GAME_INIT",
      payload: { playerIds, deck: initialDeck, dealerId: initialDealerId } satisfies GameInitBroadcast,
    });
  }, [connectedPlayers, phase, user, initGame]);

  // ── handlePlayCard (public API) ───────────────────────────────────────────
  /**
   * Play a card on behalf of the local user.
   * Validates turn ownership, applies the move locally, then broadcasts it.
   *
   * @returns PointEvents generated by the play (for animations / toasts).
   * @throws  On invalid play (wrong turn, card not in hand, etc.).
   */
  const handlePlayCard = useCallback(
    (card: Card): PointEvent[] => {
      if (!user) throw new Error("No authenticated user.");
      if (!isMyTurn) throw new Error("It is not your turn.");

      // Apply locally (throws on invalid play — let the UI handle this)
      const events = playCard(user.id, card);

      // Broadcast to opponents
      channelRef.current?.send({
        type: "broadcast",
        event: "PLAY_CARD",
        payload: { playerId: user.id, card } satisfies PlayCardBroadcast,
      });

      return events;
    },
    [user, isMyTurn, playCard]
  );

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    // Player state
    myPlayer,
    opponents,
    isMyTurn,

    // Board state
    tableCards,
    currentTurn,
    lastPlay,
    phase,
    round,
    winnerId,
    dealerId,

    // Actions
    handlePlayCard,

    // Raw access (for components that need it)
    players,
  } as const;
}
