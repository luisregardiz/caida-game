import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/config/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If authenticated, go straight to the lobby
  if (user) redirect("/lobby");

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 felt-bg" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />

      {/* Decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-900/20 rounded-full blur-3xl pointer-events-none" />

      {/* Hero */}
      <div className="relative z-10 text-center px-4 max-w-2xl mx-auto">
        <div className="text-7xl mb-6 select-none" aria-hidden="true">🃏</div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-4">
          <span className="bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">
            Caída
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/60 mb-2 font-medium">
          El juego de cartas venezolano
        </p>
        <p className="text-sm text-white/40 mb-10">
          Multijugador · Fichas Virtuales · Tiempo Real
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black hover:from-amber-300 hover:to-orange-400 transition-all duration-200 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105 active:scale-95"
          >
            Comenzar a Jugar
          </Link>
        </div>

        {/* Card suits decoration */}
        <div className="flex justify-center gap-6 mt-14 text-3xl text-white/20 select-none">
          <span title="Oros">🪙</span>
          <span title="Copas">🏆</span>
          <span title="Espadas">⚔️</span>
          <span title="Bastos">🪵</span>
        </div>
      </div>
    </main>
  );
}
