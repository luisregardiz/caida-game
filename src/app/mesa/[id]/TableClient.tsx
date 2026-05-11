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
import { Trash2, AlertTriangle, Coins, Zap } from "lucide-react";
import { formatChips, getAvatarUrl } from "@/lib/utils";
import type { Table } from "@/types/database.types";
import Image from "next/image";

interface TableClientProps {
    table: Table;
    currentUserId: string;
}

const phaseLabels: Record<string, string> = {
    idle: "Esperando",
    dealing: "Repartiendo...",
    playing: "En juego",
    scoring: "Contando puntos...",
    tanda_end: "Fin de Tanda",
    finished: "Finalizado",
};

export function TableClient({ table, currentUserId }: TableClientProps) {
    const router = useRouter();
    const supabase = createClient();
    const { user, updateBalance } = useUserStore();
    const { gameState, updatePot } = useGameStore();
    const isSinglePlayer = table.id === "singleplayer";
    const storeConnectedPlayers = useGameStore(
        (state) => state.connectedPlayers,
    );
    const connectedPlayers = useMemo(
        () =>
            isSinglePlayer
                ? [
                      {
                          userId: currentUserId,
                          username: user?.username || "Tú",
                          avatarUrl: null,
                          status: "connected" as const,
                          joinedAt: new Date().toISOString(),
                      },
                      {
                          userId: "cpu-bot",
                          username: "Máquina (Bot)",
                          avatarUrl: null,
                          status: "connected" as const,
                          joinedAt: new Date().toISOString(),
                      },
                  ]
                : storeConnectedPlayers,
        [isSinglePlayer, currentUserId, user?.username, storeConnectedPlayers],
    );

    useTablePresence(table.id);

    const {
        myPlayer,
        opponents,
        tableCards,
        isMyTurn,
        phase,
        handlePlayCard,
        players,
        lastPlay,
        dealerId,
        round,
        winnerId,
        handleNextTanda,
    } = useCaidaEngine(table.id);

    // Derive opponent presence info for display
    const opponentEngine = opponents[0] ?? null;
    const opponentPresence = opponentEngine
        ? connectedPlayers.find((p) => p.userId === opponentEngine.id)
        : null;

    // ── Caída notification ────────────────────────────────────────────────────
    const [caidaNotif, setCaidaNotif] = useState(false);
    useEffect(() => {
        // Wrap in setTimeout so setState is never synchronous inside the effect body
        let tShow: ReturnType<typeof setTimeout>;
        let tHide: ReturnType<typeof setTimeout>;
        if (!lastPlay?.isCaida) {
            tShow = setTimeout(() => setCaidaNotif(false), 0);
        } else {
            tShow = setTimeout(() => setCaidaNotif(true), 0);
            tHide = setTimeout(() => setCaidaNotif(false), 2500);
        }
        return () => { clearTimeout(tShow); clearTimeout(tHide); };
    }, [lastPlay]);

    // ── Game logs — derived UI state from external Zustand store changes ──────
    const [logs, setLogs] = useState<string[]>([]);
    const [lastLoggedRoundCantos, setLastLoggedRoundCantos] = useState(-1);
    const [lastLoggedDealerRound, setLastLoggedDealerRound] = useState(-1);

    useEffect(() => {
        if (lastPlay) {
            const playerName =
                connectedPlayers.find((p) => p.userId === lastPlay.playerId)
                    ?.username || "Alguien";
            let newLog = "";
            if (lastPlay.wentToTable) {
                newLog = `${playerName}: Lanzó a la mesa ${lastPlay.card.value} de ${lastPlay.card.suit}`;
            } else {
                const capturedStr =
                    lastPlay.capturedCards
                        ?.map((c) => `${c.value} de ${c.suit}`)
                        .join(", ") || "";
                newLog = `${playerName}: Tomó con ${lastPlay.card.value} de ${lastPlay.card.suit} → [${capturedStr}]`;
                if (lastPlay.isCaida) {
                    newLog = `💥 ¡CAÍDA! ` + newLog;
                }
            }
            // eslint-disable-next-line react-compiler/react-compiler
            setLogs((prev) => [newLog, ...prev].slice(0, 50));
        }
    }, [lastPlay, connectedPlayers]);

    useEffect(() => {
        if (
            dealerId &&
            phase !== "idle" &&
            phase !== "finished" &&
            round > lastLoggedDealerRound
        ) {
            const dealerName =
                connectedPlayers.find((p) => p.userId === dealerId)?.username ||
                "El sistema";
            // eslint-disable-next-line react-compiler/react-compiler
            setLogs((prev) =>
                [
                    `🎲 ${dealerName} ha repartido. (Mano ${round})`,
                    ...prev,
                ].slice(0, 50),
            );
            setLastLoggedDealerRound(round);
        }
    }, [dealerId, round, phase, connectedPlayers, lastLoggedDealerRound]);

    useEffect(() => {
        if (
            round > lastLoggedRoundCantos &&
            players.some((p) => p.cantos && p.cantos.length > 0)
        ) {
            const cantosLogs = players
                .filter((p) => p.cantos.length > 0)
                .map((p) => {
                    const name =
                        connectedPlayers.find((c) => c.userId === p.id)
                            ?.username || "Alguien";
                    return `🎤 ${name} cantó: ${p.cantos[0].type.toUpperCase()}`;
                });
            if (cantosLogs.length > 0) {
                // eslint-disable-next-line react-compiler/react-compiler
                setLogs((prev) => [...cantosLogs, ...prev].slice(0, 50));
            }
            setLastLoggedRoundCantos(round);
        } else if (round > lastLoggedRoundCantos && players.length > 0) {
            if (players[0].hand.length > 0) {
                setLastLoggedRoundCantos(round);
            }
        }
    }, [round, players, connectedPlayers, lastLoggedRoundCantos]);

    // ── Live table state ───────────────────────────────────────────────────────
    const [liveTable, setLiveTable] = useState<Table>(table);
    const [isBetting, setIsBetting] = useState(false);
    const [betFeedback, setBetFeedback] = useState<string | null>(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, table.id]);

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

                .update({
                    balance: newBalance,
                    updated_at: new Date().toISOString(),
                } as any)
                .eq("id", user.id);
            if (balanceError) throw balanceError;
            const { error: potError } = await supabase
                .from("tables")

                .update({
                    pot: newPot,
                    updated_at: new Date().toISOString(),
                } as any)
                .eq("id", table.id);
            if (potError) throw potError;
            updateBalance(newBalance);
            updatePot(liveTable.bet_amount);
            setBetFeedback(`✅ Apostaste ${formatChips(liveTable.bet_amount)}`);
        } catch (err) {
            console.error("[TableClient] Bet error:", err);
            setBetFeedback("❌ Error al apostar.");
        } finally {
            setIsBetting(false);
            setTimeout(() => setBetFeedback(null), 3000);
        }
    };

    /** Host deletes the table from Supabase and redirects everyone. */
    const handleDeleteTable = async () => {
        if (isDeleting) return;
        setIsDeleting(true);
        setDeleteError(null);

        if (isSinglePlayer) {
            useGameLogicStore.getState().resetEngine();
            router.push("/lobby");
            return;
        }

        try {
            const { error, count } = await supabase
                .from("tables")
                .delete({ count: "exact" })
                .eq("id", table.id)
                .eq("host_id", currentUserId); // prop del SSR, siempre coincide con auth.uid()

            if (error) throw error;
            if (count === 0) {
                throw new Error(
                    "Sin permiso para eliminar o la sala ya no existe.",
                );
            }

            useGameLogicStore.getState().resetEngine();
            router.push("/lobby");
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "Error al eliminar la sala.";
            setDeleteError(msg);
            console.error("[TableClient] Delete error:", err);
            setIsDeleting(false);
        }
    };

    /** Any player (non-host included) leaves the table and returns to lobby. */
    const handleLeave = () => {
        useGameLogicStore.getState().resetEngine();
        router.push("/lobby");
    };

    const pot = gameState?.pot ?? liveTable.pot;
    const isHost = table.host_id === currentUserId;
    const isGameActive =
        phase === "playing" || phase === "scoring" || phase === "dealing";

    return (
        <div className="felt-bg min-h-[calc(100vh-4rem)] flex flex-col">
            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/40 border-b border-white/10">
                <div>
                    <h1 className="font-bold text-white text-base sm:text-lg leading-tight">
                        {liveTable.name}
                    </h1>
                    <p className="text-xs text-white/50 flex items-center gap-2 mt-0.5">
                        <span>
                            Apuesta: {formatChips(liveTable.bet_amount)}
                        </span>
                        {isHost && (
                            <span className="text-amber-400 font-medium">
                                • Anfitrión
                            </span>
                        )}
                        {isGameActive && round > 0 && (
                            <span className="bg-white/10 px-2 py-0.5 rounded text-white/60">
                                Rondas restantes: {7 - round}
                            </span>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Pot */}
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <div>
                            <p className="text-[10px] text-amber-400/60 font-medium leading-none">
                                POTE
                            </p>
                            <p className="text-amber-400 font-bold text-xs">
                                {formatChips(pot)}
                            </p>
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
                            <Trash2 className="w-4 h-4" />
                        </motion.button>
                    )}
                </div>
            </div>

            {/* ── Caída notification overlay ──────────────────────────────────────── */}
            <AnimatePresence>
                {caidaNotif && (
                    <motion.div
                        key="caida-notif"
                        initial={{ opacity: 0, scale: 0.7, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -10 }}
                        transition={{
                            type: "spring",
                            bounce: 0.5,
                            duration: 0.4,
                        }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-100 pointer-events-none"
                    >
                        <div className="bg-[#111111]/95 backdrop-blur-sm flex items-center gap-3 pl-3 pr-5 py-3 rounded-2xl border border-amber-500/30 shadow-xl shadow-amber-500/10 caida-flash">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                                <Zap className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                                <p className="font-black text-white text-base tracking-wide leading-none">
                                    ¡CAÍDA!
                                </p>
                                <p className="text-amber-400/70 text-xs mt-0.5">
                                    +2 puntos extra
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Main area ──────────────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 sm:p-6 relative overflow-hidden">
                {/* Left sidebar — Connected players */}
                <aside className="lg:w-52 shrink-0">
                    <div className="glass rounded-2xl p-4">
                        <h2 className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-3">
                            Jugadores
                        </h2>
                        <div className="space-y-3">
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
                                        const enginePlayer = players.find(
                                            (p) => p.id === player.userId,
                                        );
                                        const score = enginePlayer?.score ?? 0;
                                        const capturedCount =
                                            enginePlayer?.captured.length ?? 0;
                                        const isActive =
                                            player.userId ===
                                            (isGameActive
                                                ? isMyTurn
                                                    ? currentUserId
                                                    : opponentEngine?.id
                                                : null);

                                        return (
                                            <motion.div
                                                key={player.userId}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
                                                    isActive
                                                        ? "bg-amber-500/10 border border-amber-500/30"
                                                        : "border border-transparent"
                                                }`}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={
                                                        player.avatarUrl ??
                                                        getAvatarUrl(
                                                            player.username,
                                                        )
                                                    }
                                                    alt={player.username}
                                                    width={32}
                                                    height={32}
                                                    className={`w-8 h-8 rounded-full bg-white/10 shrink-0 transition-all ${
                                                        isActive
                                                            ? "ring-2 ring-amber-400 turn-pulse"
                                                            : "ring-1 ring-white/10"
                                                    }`}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-white truncate">
                                                        {player.username}
                                                        {player.userId ===
                                                            currentUserId && (
                                                            <span className="ml-1 text-amber-400 text-xs">
                                                                (tú)
                                                            </span>
                                                        )}
                                                    </p>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <span className="text-xs text-amber-400 font-bold">
                                                            {score} pts
                                                        </span>
                                                        <span className="text-[10px] text-white/30">
                                                            {capturedCount}{" "}
                                                            cartas
                                                        </span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </aside>

                {/* ── Center — Game board ───────────────────────────────────────────── */}
                <div className="flex-1 flex flex-col items-center justify-between gap-4 min-h-[480px]">
                    {/* Opponent section (top) */}
                    <div className="w-full flex flex-col items-center gap-2">
                        {/* Opponent hand — face down */}
                        <div className="flex justify-center gap-2 sm:gap-3">
                            {opponentEngine &&
                            opponentEngine.hand.length > 0 ? (
                                opponentEngine.hand.map((_, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: -12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="w-[52px] h-[80px] sm:w-[62px] sm:h-[96px] relative card-shadow rounded-lg overflow-hidden"
                                    >
                                        <Image
                                            src="/cards/additions/cardBack.png"
                                            alt="Carta oponente"
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </motion.div>
                                ))
                            ) : (
                                <div className="flex gap-2 sm:gap-3 opacity-30">
                                    {[0, 1, 2].map((i) => (
                                        <div
                                            key={i}
                                            className="w-[52px] h-[80px] sm:w-[62px] sm:h-[96px] rounded-lg border border-dashed border-white/20"
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Opponent info pill */}
                        {opponentPresence && (
                            <div
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                                    !isMyTurn && phase === "playing"
                                        ? "bg-amber-500/15 border border-amber-500/40 text-amber-300"
                                        : "bg-white/5 border border-white/10 text-white/40"
                                }`}
                            >
                                <span>{opponentPresence.username}</span>
                                <span className="text-white/20">•</span>
                                <span className="font-bold">
                                    {opponentEngine?.score ?? 0} pts
                                </span>
                                <span className="text-white/20">•</span>
                                <span>
                                    {opponentEngine?.captured.length ?? 0}{" "}
                                    recolectadas
                                </span>
                                {!isMyTurn && phase === "playing" && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-1" />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Table cards — center */}
                    <div className="flex flex-col items-center gap-3 w-full">
                        {/* Cards on table */}
                        <div className="flex flex-wrap gap-3 sm:gap-4 justify-center min-h-[7rem] items-center">
                            {tableCards.length > 0 ? (
                                tableCards.map((card, idx) => {
                                    const suitName = card.suit.slice(0, -1);
                                    const imagePath = `/cards/${suitName}/${suitName}${card.value}.png`;
                                    return (
                                        <motion.div
                                            key={`${card.suit}-${card.value}-${idx}`}
                                            initial={{
                                                opacity: 0,
                                                y: 20,
                                                scale: 0.85,
                                            }}
                                            animate={{
                                                opacity: 1,
                                                y: 0,
                                                scale: 1,
                                            }}
                                            transition={{
                                                type: "spring",
                                                bounce: 0.3,
                                            }}
                                            className="w-[56px] h-[86px] sm:w-[68px] sm:h-[104px] rounded-md card-shadow bg-transparent flex items-center justify-center relative overflow-hidden"
                                        >
                                            <Image
                                                src={imagePath}
                                                alt={`${card.value} de ${card.suit}`}
                                                fill
                                                className="object-contain"
                                                unoptimized
                                            />
                                        </motion.div>
                                    );
                                })
                            ) : (
                                <div className="flex gap-3 justify-center">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div
                                            key={i}
                                            className="w-[56px] h-[86px] sm:w-[68px] sm:h-[104px] rounded-xl border-2 border-dashed border-white/15 bg-black/20 flex items-center justify-center"
                                        >
                                            <span className="text-white/15 text-xl">
                                                🃏
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Phase + turn status */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">
                                {phaseLabels[phase] ?? phase}
                            </span>
                            {phase === "playing" && (
                                <motion.p
                                    key={isMyTurn ? "my-turn" : "opp-turn"}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`text-sm font-bold ${isMyTurn ? "text-amber-400" : "text-white/50"}`}
                                >
                                    {isMyTurn
                                        ? "¡Es tu turno!"
                                        : "Turno del oponente..."}
                                </motion.p>
                            )}
                            {phase === "idle" &&
                                liveTable.status === "waiting" && (
                                    <p className="text-white/40 text-sm">
                                        Esperando jugadores...
                                    </p>
                                )}
                        </div>
                    </div>

                    {/* My section (bottom) */}
                    <div className="w-full flex flex-col items-center gap-2">
                        {/* My hand */}
                        <div className="relative flex items-end justify-center">
                            {myPlayer &&
                            myPlayer.hand &&
                            myPlayer.hand.length > 0 ? (
                                <motion.div
                                    initial={{ y: 40, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="flex justify-center gap-2 sm:gap-3"
                                >
                                    {myPlayer.hand.map((card, idx) => {
                                        const suitName = card.suit.slice(0, -1);
                                        const imagePath = `/cards/${suitName}/${suitName}${card.value}.png`;
                                        return (
                                            <button
                                                key={`${card.suit}-${card.value}-${idx}`}
                                                onClick={() =>
                                                    handlePlayCard(card)
                                                }
                                                disabled={!isMyTurn}
                                                className={`w-[62px] h-[96px] sm:w-[72px] sm:h-[112px] card-shadow rounded-md bg-transparent flex items-center justify-center relative overflow-hidden transition-all duration-200 ${
                                                    !isMyTurn
                                                        ? "opacity-60 cursor-not-allowed"
                                                        : "hover:-translate-y-5 hover:ring-2 ring-amber-400 hover:shadow-amber-500/30"
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
                            ) : (
                                phase !== "idle" &&
                                phase !== "finished" &&
                                phase !== "tanda_end" && (
                                    <div className="flex gap-2 sm:gap-3 opacity-30">
                                        {[0, 1, 2].map((i) => (
                                            <div
                                                key={i}
                                                className="w-[62px] h-[96px] sm:w-[72px] sm:h-[112px] rounded-md border border-dashed border-white/20"
                                            />
                                        ))}
                                    </div>
                                )
                            )}

                            {/* Captured pile — absolute right, far enough to not overlap the hand */}
                            {myPlayer &&
                                myPlayer.captured &&
                                myPlayer.captured.length > 0 && (
                                    <div className="absolute -right-24 sm:-right-32 bottom-0 flex flex-col items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
                                        <div className="relative w-[52px] h-[80px] sm:w-[60px] sm:h-[92px] card-shadow rounded-lg overflow-hidden">
                                            <Image
                                                src="/cards/additions/cardBack.png"
                                                alt="Cartas recogidas"
                                                fill
                                                className="object-contain pointer-events-none"
                                                unoptimized
                                            />
                                        </div>
                                        <div className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold rounded-full whitespace-nowrap">
                                            {myPlayer.captured.length}{" "}
                                            recolectadas
                                        </div>
                                    </div>
                                )}
                        </div>

                        {/* My info pill — below the hand so hover animation doesn't collide */}
                        {myPlayer && (
                            <div
                                className={`mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                                    isMyTurn && phase === "playing"
                                        ? "bg-amber-500/15 border border-amber-500/40 text-amber-300"
                                        : "bg-white/5 border border-white/10 text-white/40"
                                }`}
                            >
                                <span>{user?.username || "Tú"}</span>
                                <span className="text-white/20">•</span>
                                <span className="font-bold">
                                    {myPlayer.score} pts
                                </span>
                                <span className="text-white/20">•</span>
                                <span>
                                    {myPlayer.captured.length} recolectadas
                                </span>
                                {isMyTurn && phase === "playing" && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-1" />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right sidebar — Logs */}
                <aside className="hidden sm:flex lg:w-60 shrink-0 flex-col">
                    <div className="glass rounded-2xl p-4 flex-1 overflow-hidden flex flex-col max-h-[560px]">
                        <h2 className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-3">
                            Registro
                        </h2>
                        <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 text-xs">
                            {logs.length === 0 ? (
                                <p className="text-white/30 italic">
                                    No hay jugadas aún...
                                </p>
                            ) : (
                                logs.map((log, i) => (
                                    <div
                                        key={i}
                                        className={`p-2 rounded-lg border text-white/60 leading-relaxed ${
                                            log.startsWith("💥")
                                                ? "bg-red-500/10 border-red-500/30 text-red-300"
                                                : "bg-white/4 border-white/8"
                                        }`}
                                    >
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            {/* ── Bottom action bar ───────────────────────────────────────────────── */}
            {!isGameActive && (
                <div className="px-4 sm:px-6 py-4 bg-black/40 border-t border-white/10">
                    <div className="max-w-md mx-auto flex items-center gap-4">
                        <motion.button
                            id="place-bet-btn"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleBet}
                            disabled={isBetting || !user}
                            className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-amber-500/40"
                        >
                            {isBetting
                                ? "Apostando..."
                                : `Apostar ${formatChips(liveTable.bet_amount)}`}
                        </motion.button>
                        <div className="text-right shrink-0">
                            <p className="text-xs text-white/40">Tu saldo</p>
                            <p className="text-amber-400 font-bold text-sm">
                                {user ? formatChips(user.balance) : "—"}
                            </p>
                        </div>
                    </div>
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
            )}

            {/* ── Delete room confirmation modal ─────────────────────────────────── */}
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
                                    <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="w-5 h-5 text-red-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-white">
                                            Eliminar Sala
                                        </h2>
                                        <p className="text-xs text-white/40 mt-0.5">
                                            Esta acción no se puede deshacer
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-white/60 mb-4">
                                    ¿Estás seguro que quieres eliminar{" "}
                                    <span className="font-semibold text-white">
                                        &quot;{liveTable.name}&quot;
                                    </span>
                                    ? Todos los jugadores conectados serán
                                    desconectados.
                                </p>
                                {deleteError && (
                                    <p className="text-red-400 text-xs text-center mb-4 px-2">
                                        ⚠️ {deleteError}
                                    </p>
                                )}
                                <div className="flex gap-3">
                                    <button
                                        id="cancel-delete-room"
                                        onClick={() => {
                                            setShowDeleteConfirm(false);
                                            setDeleteError(null);
                                        }}
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
                                        {isDeleting
                                            ? "Eliminando..."
                                            : "Sí, eliminar"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── End of Tanda modal ─────────────────────────────────────────────── */}
            <AnimatePresence>
                {phase === "tanda_end" && (
                    <>
                        <motion.div
                            key="tanda-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md"
                        />
                        <motion.div
                            key="tanda-modal"
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        >
                            <div className="glass rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/20 text-center">
                                <h2 className="text-3xl font-black text-amber-400 mb-1">
                                    Fin de Tanda
                                </h2>
                                <p className="text-white/50 text-sm mb-6">
                                    Se agotaron las 40 cartas.
                                </p>
                                <div className="space-y-3 mb-8 text-left">
                                    {players.map((p) => {
                                        const name =
                                            connectedPlayers.find(
                                                (c) => c.userId === p.id,
                                            )?.username || "Jugador";
                                        const isMe = p.id === currentUserId;
                                        return (
                                            <div
                                                key={p.id}
                                                className={`p-4 rounded-xl flex justify-between items-center ${
                                                    isMe
                                                        ? "bg-amber-500/10 border border-amber-500/30"
                                                        : "bg-white/5 border border-white/10"
                                                }`}
                                            >
                                                <div>
                                                    <p className="font-bold text-white">
                                                        {name} {isMe && "(Tú)"}
                                                    </p>
                                                    <p className="text-xs text-white/50">
                                                        Cartas:{" "}
                                                        <span className="text-amber-400 font-bold">
                                                            {p.captured.length}
                                                        </span>
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-white/50 mb-0.5">
                                                        Puntos
                                                    </p>
                                                    <p className="text-2xl font-black text-white">
                                                        {p.score}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleLeave}
                                        className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 transition-all"
                                    >
                                        Retirarme
                                    </button>
                                    {isHost || isSinglePlayer ? (
                                        <button
                                            onClick={handleNextTanda}
                                            className="flex-1 py-3 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all shadow-lg shadow-amber-500/20"
                                        >
                                            Continuar
                                        </button>
                                    ) : (
                                        <button
                                            disabled
                                            className="flex-1 py-3 rounded-xl text-sm font-bold bg-white/10 text-white/50 cursor-not-allowed"
                                        >
                                            Esperando al host...
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── Game Over modal ─────────────────────────────────────────────────── */}
            <AnimatePresence>
                {phase === "finished" && winnerId && (
                    <>
                        <motion.div
                            key="gameover-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40 bg-black/90 backdrop-blur-md"
                        />
                        <motion.div
                            key="gameover-modal"
                            initial={{ opacity: 0, scale: 0.8, y: 40 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 20 }}
                            transition={{ type: "spring", bounce: 0.5 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        >
                            <div className="glass rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-white/10 text-center">
                                <div className="text-6xl mb-4">
                                    {winnerId === currentUserId ? "🏆" : "💔"}
                                </div>
                                <h2
                                    className={`text-4xl font-black mb-2 ${
                                        winnerId === currentUserId
                                            ? "text-amber-400"
                                            : "text-red-400"
                                    }`}
                                >
                                    {winnerId === currentUserId
                                        ? "¡GANASTE!"
                                        : "PERDISTE"}
                                </h2>
                                <p className="text-white/60 text-sm mb-6">
                                    {winnerId === currentUserId
                                        ? "Alcanzaste los 24 puntos primero."
                                        : "Tu oponente alcanzó los 24 puntos."}
                                </p>
                                <div className="bg-black/40 rounded-xl p-4 mb-8">
                                    {players.map((p) => {
                                        const name =
                                            connectedPlayers.find(
                                                (c) => c.userId === p.id,
                                            )?.username || "Jugador";
                                        return (
                                            <div
                                                key={p.id}
                                                className="flex justify-between items-center py-2 border-b border-white/5 last:border-0"
                                            >
                                                <span className="text-white/70 text-sm">
                                                    {name}
                                                </span>
                                                <span className="text-xl font-bold text-white">
                                                    {p.score}{" "}
                                                    <span className="text-xs text-white/40 font-normal">
                                                        pts
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={handleLeave}
                                    className="w-full py-4 rounded-xl text-sm font-bold bg-white text-black hover:bg-gray-200 transition-all"
                                >
                                    Volver al Lobby
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
