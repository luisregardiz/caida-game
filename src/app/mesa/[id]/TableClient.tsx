"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/config/supabase/client";
import { useUserStore } from "@/store/userStore";
import { useGameStore } from "@/store/gameStore";
import { useTablePresence } from "@/hooks/useTablePresence";
import { useCaidaEngine } from "@/hooks/useCaidaEngine";
import { useGameLogicStore } from "@/store/gameLogicStore";
import { formatChips, getAvatarUrl } from "@/lib/utils";
import type { Table } from "@/types/database.types";
import Image from "next/image";

interface TableClientProps {
  table: Table;
  currentUserId: string;
}

export function TableClient({ table, currentUserId }: TableClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const { user, updateBalance } = useUserStore();
  const { gameState, updatePot } = useGameStore();
  const isSinglePlayer = table.id === "singleplayer";
  const storeConnectedPlayers = useGameStore((state) => state.connectedPlayers);
  const connectedPlayers = useMemo(() => isSinglePlayer
    ? [
        { userId: currentUserId, username: user?.username || "Tú", avatarUrl: null, status: "connected" as const, joinedAt: new Date().toISOString() },
        { userId: "cpu-bot", username: "Máquina (Bot)", avatarUrl: null, status: "connected" as const, joinedAt: new Date().toISOString() }
      ]
    : storeConnectedPlayers, [isSinglePlayer, currentUserId, user?.username, storeConnectedPlayers]);

  // Subscribe to Presence
  useTablePresence(table.id);

  // Initialize Caida Engine
  const {
    myPlayer,
    tableCards,
    isMyTurn,
    phase,
    handlePlayCard,
    players,
    lastPlay,
    dealerId,
    round,
  } = useCaidaEngine(table.id);

  const [logs, setLogs] = useState<string[]>([]);
  const [lastLoggedRoundCantos, setLastLoggedRoundCantos] = useState(-1);
  const [lastLoggedDealerRound, setLastLoggedDealerRound] = useState(-1);

  // Log de Jugadas (Cartas)
  useEffect(() => {
    if (lastPlay) {
      const playerName = connectedPlayers.find((p) => p.userId === lastPlay.playerId)?.username || "Alguien";
      const action = lastPlay.wentToTable ? "lanzó a la mesa" : "capturó con";
      const newLog = `${playerName} ${action} ${lastPlay.card.value} de ${lastPlay.card.suit}`;
      setLogs((prev) => [newLog, ...prev].slice(0, 50));
    }
  }, [lastPlay, connectedPlayers]);

  // Log del Repartidor
  useEffect(() => {
    if (dealerId && phase !== 'idle' && phase !== 'finished' && round > lastLoggedDealerRound) {
      const dealerName = connectedPlayers.find(p => p.userId === dealerId)?.username || "El sistema";
      setLogs((prev) => [`🎲 ${dealerName} ha repartido las cartas. (Mano ${round})`, ...prev].slice(0, 50));
      setLastLoggedDealerRound(round);
    }
  }, [dealerId, round, phase, connectedPlayers, lastLoggedDealerRound]);

  // Log de Cantos
  useEffect(() => {
    if (round > lastLoggedRoundCantos && players.some(p => p.cantos && p.cantos.length > 0)) {
      const cantosLogs = players
        .filter(p => p.cantos.length > 0)
        .map(p => {
          const name = connectedPlayers.find(c => c.userId === p.id)?.username || "Alguien";
          return `🎤 ${name} cantó: ${p.cantos[0].type.toUpperCase()}`;
        });

      if (cantosLogs.length > 0) {
        setLogs((prev) => [...cantosLogs, ...prev].slice(0, 50));
      }
      setLastLoggedRoundCantos(round);
    } else if (round > lastLoggedRoundCantos && players.length > 0) {
      // Si nadie cantó, igual actualizamos el estado para no volver a evaluar esta ronda.
      // Se evalúa sólo cuando players.length > 0 para evitar falsos positivos iniciales.
      if (players[0].hand.length > 0) {
        setLastLoggedRoundCantos(round);
      }
    }
  }, [round, players, connectedPlayers, lastLoggedRoundCantos]);

  // Live table state
  const [liveTable, setLiveTable] = useState<Table>(table);
  const [isBetting, setIsBetting] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);

  // Delete flow
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Subscribe to table updates via Postgres Changes
  useEffect(() => {
    const channel = supabase
      .channel(`table-updates:${table.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tables",
          filter: `id=eq.${table.id}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          setLiveTable(payload.new as Table);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, table.id]);

  /**
   * MOCK BET — Deducts bet_amount from user balance and adds it to table pot.
   * This simulates the core economy action without real game logic.
   */
  const handleBet = async () => {
    if (!user || isBetting) return;
    if (user.balance < liveTable.bet_amount) {
      setBetFeedback("❌ No tienes suficientes fichas.");
      setTimeout(() => setBetFeedback(null), 3000);
      return;
    }

    setIsBetting(true);
    setBetFeedback(null);

    try {
      const newBalance = user.balance - liveTable.bet_amount;
      const newPot = liveTable.pot + liveTable.bet_amount;


      const { error: balanceError } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ balance: newBalance, updated_at: new Date().toISOString() } as any)
        .eq("id", user.id);

      if (balanceError) throw balanceError;

      const { error: potError } = await supabase
        .from("tables")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ pot: newPot, updated_at: new Date().toISOString() } as any)
        .eq("id", table.id);

      if (potError) throw potError;

      updateBalance(newBalance);
      updatePot(liveTable.bet_amount);
      setBetFeedback(`✅ Apostaste ${formatChips(liveTable.bet_amount)}`);
    } catch (err) {
      console.error("[TableClient] Bet error:", err);
      setBetFeedback("❌ Error al apostar. Intenta de nuevo.");
    } finally {
      setIsBetting(false);
      setTimeout(() => setBetFeedback(null), 3000);
    }
  };

  /** Deletes the table and redirects the host back to the lobby. */
  const handleDeleteTable = async () => {
    if (!user || isDeleting) return;
    setIsDeleting(true);
    
    if (isSinglePlayer) {
      useGameLogicStore.getState().resetEngine();
      router.push("/lobby");
      return;
    }

    try {
      const { error } = await supabase
        .from("tables")
        .delete()
        .eq("id", table.id)
        .eq("host_id", user.id);
      if (error) throw error;
      router.push("/lobby");
    } catch (err) {
      console.error("[TableClient] Delete error:", err);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const pot = gameState?.pot ?? liveTable.pot;
  const isHost = table.host_id === currentUserId;

  return (
    <div className="felt-bg min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Table header */}
      <div className="flex items-center justify-between px-6 py-4 bg-black/30 border-b border-white/10">
        <div>
          <h1 className="font-bold text-white text-lg">{liveTable.name}</h1>
          <p className="text-xs text-white/50">
            Apuesta: {formatChips(liveTable.bet_amount)}
            {isHost && (
              <span className="ml-2 text-amber-400 font-medium">• Anfitrión</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Pot */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-amber-400 text-lg">💰</span>
            <div>
              <p className="text-xs text-amber-400/60 font-medium">POTE</p>
              <p className="text-amber-400 font-bold text-sm">{formatChips(pot)}</p>
            </div>
          </div>

          {/* Delete room — host only */}
          {isHost && (
            <motion.button
              id="delete-room-btn"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDeleteConfirm(true)}
              title="Eliminar sala"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-red-500/20 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </motion.button>
          )}
        </div>
      </div>

      {/* Main felt area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 relative">

        {/* Connected players (Presence) */}
        <aside className="lg:w-56 shrink-0">
          <div className="glass rounded-2xl p-4">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
              Jugadores Conectados
            </h2>
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {connectedPlayers.length === 0 ? (
                  <motion.p
                    key="no-players"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-white/30 italic"
                  >
                    Esperando jugadores…
                  </motion.p>
                ) : (
                  connectedPlayers.map((player) => {
                    const enginePlayer = players.find(p => p.id === player.userId);
                    const score = enginePlayer?.score ?? 0;
                    const capturedCount = enginePlayer?.captured.length ?? 0;

                    return (
                      <motion.div
                        key={player.userId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="flex items-center gap-2.5"
                      >
                        {/* Avatar */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={player.avatarUrl ?? getAvatarUrl(player.username)}
                          alt={player.username}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full bg-white/10 ring-2 ring-white/10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {player.username}
                            {player.userId === currentUserId && (
                              <span className="ml-1 text-amber-400 text-xs">(tú)</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 justify-between mt-0.5">
                            <div className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                              <span className="text-[10px] text-white/40">En línea</span>
                            </div>
                            <span className="text-xs text-amber-400 font-bold">{score} pts</span>
                          </div>
                          <p className="text-[10px] text-white/30 mt-0.5">Cartas recolectadas: {capturedCount}</p>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        </aside>

        {/* Center — Game board */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center w-full"
          >
            {/* Table Cards */}
            <div className="flex flex-wrap gap-4 justify-center mb-12 min-h-[8rem]">
              {tableCards.length > 0 ? (
                tableCards.map((card, idx) => {
                  const suitName = card.suit.slice(0, -1); // quita la 's' (oros -> oro)
                  const imagePath = `/cards/${suitName}/${suitName}${card.value}.png`;

                  return (
                    <motion.div
                      key={`${card.suit}-${card.value}-${idx}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl bg-transparent  flex items-center justify-center relative overflow-hidden"
                    >
                      <Image
                        src={imagePath}
                        alt={`${card.value} de ${card.suit}`}
                        fill
                        className="object-contain"
                        unoptimized // en caso de que sean assets locales que cambian
                      />
                    </motion.div>
                  );
                })
              ) : (
                <div className="flex gap-4 justify-center">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl border-2 border-dashed border-white/20 bg-black/20 flex items-center justify-center"
                    >
                      <span className="text-white/20 text-2xl">🃏</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-white/80 font-medium mb-1">
              Fase: <span className="uppercase text-amber-400">{phase}</span>
            </p>
            <p className="text-white/40 text-sm">
              {liveTable.status === "waiting" ? "Esperando jugadores..." : (isMyTurn ? "¡Es tu turno!" : "Turno del oponente")}
            </p>
          </motion.div>

          {/* Player Hand */}
          {myPlayer && myPlayer.hand && myPlayer.hand.length > 0 && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex justify-center gap-4 mt-12"
            >
              {myPlayer.hand.map((card, idx) => {
                const suitName = card.suit.slice(0, -1);
                const imagePath = `/cards/${suitName}/${suitName}${card.value}.png`;

                return (
                  <button
                    key={`${card.suit}-${card.value}-${idx}`}
                    onClick={() => handlePlayCard(card)}
                    disabled={!isMyTurn}
                    className={`w-[68px] h-[110px] sm:w-[68px] sm:h-[110px] card-shadow  rounded-xs  bg-transparent flex items-center justify-center relative overflow-hidden transition-transform ${!isMyTurn ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-4 hover:ring-2 ring-amber-400"
                      }`}
                  >
                    <Image
                      src={imagePath}
                      alt={`${card.value} de ${card.suit}`}
                      fill
                      className="object-contain pointer-events-none"
                      unoptimized
                    />
                  </button>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* Logs Sidebar */}
        <aside className="lg:w-64 shrink-0 flex flex-col hidden sm:flex">
          <div className="glass rounded-2xl p-4 flex-1 overflow-hidden flex flex-col max-h-[600px]">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
              Registro de jugadas
            </h2>
            <div className="space-y-2 overflow-y-auto flex-1 pr-1 text-xs">
              {logs.length === 0 ? (
                <p className="text-white/30 italic">No hay jugadas aún...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="bg-white/5 p-2 rounded border border-white/10 text-white/70">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom action bar */}
      <div className="px-6 py-4 bg-black/40 border-t border-white/10">
        <div className="max-w-md mx-auto flex items-center gap-4">
          {/* Mock bet button */}
          <motion.button
            id="place-bet-btn"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleBet}
            disabled={isBetting || !user}
            className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-amber-500/40"
          >
            {isBetting ? "Apostando..." : `Apostar ${formatChips(liveTable.bet_amount)}`}
          </motion.button>

          {/* User balance mini display */}
          <div className="text-right shrink-0">
            <p className="text-xs text-white/40">Tu saldo</p>
            <p className="text-amber-400 font-bold text-sm">
              {user ? formatChips(user.balance) : "—"}
            </p>
          </div>
        </div>

        {/* Bet feedback toast */}
        <AnimatePresence>
          {betFeedback && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs mt-2 text-white/70"
            >
              {betFeedback}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Delete room confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div
              key="delete-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              key="delete-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-red-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-400">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Eliminar Sala</h2>
                    <p className="text-xs text-white/40 mt-0.5">Esta acción no se puede deshacer</p>
                  </div>
                </div>

                <p className="text-sm text-white/60 mb-6">
                  ¿Estás seguro que quieres eliminar{" "}
                  <span className="font-semibold text-white">&quot;{liveTable.name}&quot;</span>?
                  Todos los jugadores conectados serán desconectados.
                </p>

                <div className="flex gap-3">
                  <button
                    id="cancel-delete-room"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 disabled:opacity-40 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    id="confirm-delete-room"
                    onClick={handleDeleteTable}
                    disabled={isDeleting}
                    className="flex-1 py-3 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-all shadow-lg shadow-red-600/20"
                  >
                    {isDeleting ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
