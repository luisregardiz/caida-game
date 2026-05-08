"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/config/supabase/client";
import { useUserStore } from "@/store/userStore";
import { formatChips } from "@/lib/utils";
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
  const [newTableName, setNewTableName] = useState("");
  const [betAmount, setBetAmount] = useState(50);
  const [createError, setCreateError] = useState<string | null>(null);

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
                t.id === (payload.new as Table).id ? (payload.new as Table) : t
              )
            );
          } else if (payload.eventType === "DELETE") {
            setTables((prev) =>
              prev.filter((t) => t.id !== (payload.old as Table).id)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreateError(null);
    setIsCreating(true);

    try {
      if (user.balance < betAmount) {
        throw new Error("No tienes suficientes fichas para crear esta mesa.");
      }

      const tableName = newTableName.trim() || `Mesa de ${user.username}`;
      const { data, error } = await supabase
        .from("tables")
        .insert({
          name: tableName,
          host_id: user.id,
          bet_amount: betAmount,
          status: "waiting",
        })
        .select()
        .single();

      if (error) throw error;
      router.push(`/mesa/${data.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al crear la mesa";
      setCreateError(message);
    } finally {
      setIsCreating(false);
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
          <h1 className="text-3xl font-black text-white">Lobby</h1>
          <p className="text-white/50 text-sm mt-1">
            {tables.length} {tables.length === 1 ? "mesa disponible" : "mesas disponibles"}
          </p>
        </div>

        <motion.button
          id="create-table-btn"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-shadow"
        >
          + Crear Mesa
        </motion.button>
      </div>

      {/* Tables grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence initial={false}>
          {tables.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full text-center py-20 text-white/30"
            >
              <div className="text-5xl mb-4">🃏</div>
              <p className="text-lg font-medium">No hay mesas disponibles</p>
              <p className="text-sm mt-1">¡Sé el primero en crear una!</p>
            </motion.div>
          ) : (
            tables.map((table, i) => (
              <motion.div
                key={table.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-2xl p-5 hover:bg-white/[0.07] transition-colors cursor-pointer group"
                onClick={() => router.push(`/mesa/${table.id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                      {table.name}
                    </h2>
                    <p className="text-xs text-white/40 mt-0.5">
                      {tableStatuses[table.status]}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      table.status === "waiting"
                        ? "bg-green-500/20 text-green-400"
                        : table.status === "playing"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-white/10 text-white/40"
                    }`}
                  >
                    {table.status === "waiting"
                      ? "Abierta"
                      : table.status === "playing"
                      ? "Jugando"
                      : "Cerrada"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <span>💰</span>
                    <span className="font-semibold">{formatChips(table.bet_amount)}</span>
                  </div>
                  {table.pot > 0 && (
                    <div className="text-white/40 text-xs">
                      Pote: {formatChips(table.pot)}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                  <button
                    id={`join-table-${table.id}`}
                    className="w-full py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/mesa/${table.id}`);
                    }}
                  >
                    Entrar a la Mesa →
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
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
                <h2 className="text-lg font-bold text-white mb-5">Crear Nueva Mesa</h2>

                <form onSubmit={handleCreateTable} className="space-y-4">
                  <div>
                    <label htmlFor="table-name" className="block text-xs font-medium text-white/60 mb-1.5">
                      Nombre de la Mesa
                    </label>
                    <input
                      id="table-name"
                      type="text"
                      maxLength={40}
                      value={newTableName}
                      onChange={(e) => setNewTableName(e.target.value)}
                      placeholder={`Mesa de ${user?.username ?? "jugador"}`}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="bet-amount" className="block text-xs font-medium text-white/60 mb-1.5">
                      Apuesta Inicial — {formatChips(betAmount)}
                    </label>
                    <input
                      id="bet-amount"
                      type="range"
                      min={10}
                      max={Math.min(500, user?.balance ?? 500)}
                      step={10}
                      value={betAmount}
                      onChange={(e) => setBetAmount(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                      <span>₣ 10</span>
                      <span>₣ {Math.min(500, user?.balance ?? 500)}</span>
                    </div>
                  </div>

                  {createError && (
                    <p className="text-red-400 text-xs text-center">{createError}</p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      id="cancel-create-table"
                      type="button"
                      onClick={() => setShowCreateModal(false)}
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
                      {isCreating ? "Creando..." : "Crear"}
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
