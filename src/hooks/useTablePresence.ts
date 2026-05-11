"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/config/supabase/client";
import { useGameStore } from "@/store/gameStore";
import { useUserStore } from "@/store/userStore";
import { useGameLogicStore } from "@/store/gameLogicStore";
import type { PlayerPresence } from "@/types/game.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

const GRACE_SECONDS = 30;

export interface DisconnectState {
  player: PlayerPresence | null;
  secondsLeft: number;
}

export function useTablePresence(tableId: string) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { user } = useUserStore();
  const { setConnectedPlayers, resetGame } = useGameStore();

  // Grace period state — exported for UI
  const [disconnectState, setDisconnectState] = useState<DisconnectState>({
    player: null,
    secondsLeft: 0,
  });

  // Refs to manage timers without stale-closure issues
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedPlayerIdRef = useRef<string | null>(null);

  const clearGraceTimers = () => {
    if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
    graceTimerRef.current = null;
    graceIntervalRef.current = null;
  };

  const cancelGracePeriod = () => {
    clearGraceTimers();
    disconnectedPlayerIdRef.current = null;
    setDisconnectState({ player: null, secondsLeft: 0 });
  };

  const startGracePeriod = (leftPlayer: PlayerPresence) => {
    clearGraceTimers();
    disconnectedPlayerIdRef.current = leftPlayer.userId;

    let remaining = GRACE_SECONDS;
    setDisconnectState({ player: leftPlayer, secondsLeft: remaining });

    graceIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setDisconnectState((prev) => ({ ...prev, secondsLeft: remaining }));
    }, 1000);

    graceTimerRef.current = setTimeout(async () => {
      clearInterval(graceIntervalRef.current!);
      disconnectedPlayerIdRef.current = null;
      setDisconnectState({ player: null, secondsLeft: 0 });

      await supabase.from("tables").update({ status: "finished" }).eq("id", tableId);
      window.location.href = "/lobby";
    }, GRACE_SECONDS * 1000);
  };

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
        const players = Object.values(presenceState).flat();
        setConnectedPlayers(players);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        const reconnectedOpponent = (newPresences as unknown as PlayerPresence[]).find(
          (p) => p.userId !== user.id && p.userId === disconnectedPlayerIdRef.current
        );
        if (reconnectedOpponent) {
          cancelGracePeriod();
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        const { phase } = useGameLogicStore.getState();
        const presences = leftPresences as unknown as PlayerPresence[];
        const leftOpponent = presences.find((p) => p.userId !== user.id);

        if (leftOpponent && (phase === "playing" || phase === "dealing")) {
          startGracePeriod(leftOpponent);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track(presencePayload);
        }
      });

    return () => {
      clearGraceTimers();
      channel.untrack();
      supabase.removeChannel(channel);
      resetGame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, user]);

  return { channelRef, disconnectState };
}
