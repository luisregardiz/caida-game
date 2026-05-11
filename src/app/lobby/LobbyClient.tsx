"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Home, KeyRound, Bot } from "lucide-react";
import { createClient } from "@/config/supabase/client";
import { useUserStore } from "@/store/userStore";
import { formatChips } from "@/lib/utils";
import { useGameLogicStore } from "@/store/gameLogicStore";
import type { Table } from "@/types/database.types";

interface LobbyClientProps {
    initialTables: Table[];
}

export function LobbyClient({ initialTables }: LobbyClientProps) {
    const router = useRouter();
    const supabase = createClient();
    const { user } = useUserStore();

    const [tables, setTables] = useState<Table[]>(initialTables);
    const [isCreating, setIsCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [betAmount, setBetAmount] = useState(50);
    const [createError, setCreateError] = useState<string | null>(null);
    const [joinError, setJoinError] = useState<string | null>(null);

    // Delete flow
    const [tableToDelete, setTableToDelete] = useState<string | null>(null); // id of table pending confirmation
    const [isDeleting, setIsDeleting] = useState(false);

    // Subscribe to real-time changes in the tables table
    useEffect(() => {
        const channel = supabase
            .channel("lobby:tables")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "tables" },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (payload: any) => {
                    if (payload.eventType === "INSERT") {
                        setTables((prev) => [payload.new as Table, ...prev]);
                    } else if (payload.eventType === "UPDATE") {
                        setTables((prev) =>
                            prev.map((t) =>
                                t.id === (payload.new as Table).id
                                    ? (payload.new as Table)
                                    : t,
                            ),
                        );
                    } else if (payload.eventType === "DELETE") {
                        setTables((prev) =>
                            prev.filter(
                                (t) => t.id !== (payload.old as Table).id,
                            ),
                        );
                    }
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    const generateRoomCode = () =>
        Math.random().toString(36).substring(2, 8).toUpperCase();

    const handleCreateTable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setCreateError(null);
        setIsCreating(true);

        try {
            if (user.balance < betAmount) {
                throw new Error(
                    "No tienes suficientes fichas para crear esta mesa.",
                );
            }

            const roomCode = generateRoomCode();
            const { data, error } = await supabase
                .from("tables")
                .insert({
                    name: roomCode, // Usamos 'name' como 'roomCode' para no alterar el esquema
                    host_id: user.id,
                    bet_amount: betAmount,
                    status: "waiting",
                    max_players: 2,
                })
                .select()
                .single();

            if (error) throw error;

            // Mostrar al host el código en el modal de la mesa o simplemente redirigirlo y que allá vea el ID/Código.
            useGameLogicStore.getState().resetEngine();
            router.push(`/mesa/${data.id}`);
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Error al crear la mesa";
            setCreateError(message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleJoinWithCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setJoinError(null);

        if (!joinCode.trim()) {
            setJoinError("Ingresa un código.");
            return;
        }

        const { data, error } = await supabase
            .from("tables")
            .select("*")
            .eq("name", joinCode.trim().toUpperCase())
            .eq("status", "waiting")
            .single();

        if (error || !data) {
            setJoinError(
                "Código inválido, la sala ya está llena o el juego ya empezó.",
            );
        } else {
            useGameLogicStore.getState().resetEngine();
            router.push(`/mesa/${data.id}`);
        }
    };

    const handleDeleteTable = async (tableId: string) => {
        if (!user || isDeleting) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from("tables")
                .delete()
                .eq("id", tableId)
                .eq("host_id", user.id);
            if (error) throw error;
        } catch (err) {
            console.error("[LobbyClient] Delete error:", err);
        } finally {
            setIsDeleting(false);
            setTableToDelete(null);
        }
    };

    const tableStatuses: Record<Table["status"], string> = {
        waiting: "Esperando jugadores",
        playing: "En juego",
        finished: "Terminada",
    };

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-white">
                        Lobby de Caída
                    </h1>
                    <p className="text-white/50 text-sm mt-1">
                        Juega con un amigo o contra la máquina
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
                {/* Crear Sala */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="glass rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer text-center group"
                    onClick={() => setShowCreateModal(true)}
                >
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mb-4 group-hover:bg-amber-500/25 group-hover:border-amber-500/35 transition-all">
                        <Home className="w-7 h-7 text-amber-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        Crear Sala Privada
                    </h2>
                    <p className="text-white/50 text-sm">
                        Genera un código e invita a un amigo a jugar contigo.
                    </p>
                </motion.div>

                {/* Unirse a Sala */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="glass rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer text-center group"
                    onClick={() => setShowJoinModal(true)}
                >
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:bg-blue-500/25 group-hover:border-blue-500/35 transition-all">
                        <KeyRound className="w-7 h-7 text-blue-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        Unirse con Código
                    </h2>
                    <p className="text-white/50 text-sm">
                        Si ya tienes un código, úsalo aquí para entrar a la
                        mesa.
                    </p>
                </motion.div>

                {/* Jugar contra CPU */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="glass rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer text-center group"
                    onClick={() => {
                        useGameLogicStore.getState().resetEngine();
                        router.push("/mesa/singleplayer");
                    }}
                >
                    <div className="w-16 h-16 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center mb-4 group-hover:bg-purple-500/25 group-hover:border-purple-500/35 transition-all">
                        <Bot className="w-7 h-7 text-purple-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        Practicar vs CPU
                    </h2>
                    <p className="text-white/50 text-sm">
                        Juega offline contra el bot para mejorar tus
                        habilidades.
                    </p>
                </motion.div>
            </div>

            {/* Create Table Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <>
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowCreateModal(false)}
                            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                        />
                        <motion.div
                            key="modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        >
                            <div className="glass rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                                <h2 className="text-lg font-bold text-white mb-5">
                                    Crear Nueva Mesa
                                </h2>

                                <form
                                    onSubmit={handleCreateTable}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label
                                            htmlFor="bet-amount"
                                            className="block text-xs font-medium text-white/60 mb-1.5"
                                        >
                                            Apuesta Inicial —{" "}
                                            {formatChips(betAmount)}
                                        </label>
                                        <input
                                            id="bet-amount"
                                            type="range"
                                            min={10}
                                            max={Math.min(
                                                500,
                                                user?.balance ?? 500,
                                            )}
                                            step={10}
                                            value={betAmount}
                                            onChange={(e) =>
                                                setBetAmount(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="w-full accent-amber-400"
                                        />
                                        <div className="flex justify-between text-xs text-white/30 mt-1">
                                            <span>₣ 10</span>
                                            <span>
                                                ₣{" "}
                                                {Math.min(
                                                    500,
                                                    user?.balance ?? 500,
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {createError && (
                                        <p className="text-red-400 text-xs text-center">
                                            {createError}
                                        </p>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            id="cancel-create-table"
                                            type="button"
                                            onClick={() =>
                                                setShowCreateModal(false)
                                            }
                                            className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            id="confirm-create-table"
                                            type="submit"
                                            disabled={isCreating}
                                            className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-black disabled:opacity-50 transition-all hover:from-amber-300"
                                        >
                                            {isCreating
                                                ? "Creando..."
                                                : "Crear"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showJoinModal && (
                    <>
                        <motion.div
                            key="join-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowJoinModal(false)}
                            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                        />
                        <motion.div
                            key="join-modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        >
                            <div className="glass rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                                <h2 className="text-lg font-bold text-white mb-5">
                                    Unirse a Sala
                                </h2>

                                <form
                                    onSubmit={handleJoinWithCode}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label
                                            htmlFor="join-code"
                                            className="block text-xs font-medium text-white/60 mb-1.5"
                                        >
                                            Código de Sala (6 dígitos)
                                        </label>
                                        <input
                                            id="join-code"
                                            type="text"
                                            maxLength={6}
                                            value={joinCode}
                                            onChange={(e) =>
                                                setJoinCode(
                                                    e.target.value.toUpperCase(),
                                                )
                                            }
                                            placeholder="EJ: X7B9P2"
                                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 text-center tracking-widest font-mono text-xl uppercase"
                                        />
                                    </div>

                                    {joinError && (
                                        <p className="text-red-400 text-xs text-center">
                                            {joinError}
                                        </p>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowJoinModal(false)
                                            }
                                            className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={joinCode.length < 3}
                                            className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-400 to-indigo-500 text-white disabled:opacity-50 transition-all hover:from-blue-300"
                                        >
                                            Unirse
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
