"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/config/supabase/client";
import { useGameStore } from "@/store/gameStore";
import { useUserStore } from "@/store/userStore";
import type { PlayerPresence } from "@/types/game.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Hook that manages Supabase Presence for a specific table (mesa).
 * Tracks which players are currently connected to the room.
 *
 * @param tableId - The ID of the game table to track presence for.
 */
export function useTablePresence(tableId: string) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { user } = useUserStore();
  const { setConnectedPlayers, resetGame } = useGameStore();

  useEffect(() => {
    if (!tableId || !user) return;

    const presencePayload: PlayerPresence = {
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatar_url,
      status: "connected",
      joinedAt: new Date().toISOString(),
    };

    const channel = supabase.channel(`table:${tableId}`, {
      config: { presence: { key: user.id } },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState<PlayerPresence>();
        // Flatten the presence state: each key maps to an array of presence objects
        const players = Object.values(presenceState).flat();
        setConnectedPlayers(players);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        console.log("[Presence] Player joined:", newPresences);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        console.log("[Presence] Player left:", leftPresences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track(presencePayload);
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      resetGame();
    };
  }, [tableId, user, supabase, setConnectedPlayers, resetGame]);

  return channelRef;
}
