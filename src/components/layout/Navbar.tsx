"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/config/supabase/client";
import { useUserStore } from "@/store/userStore";
import { formatChips } from "@/lib/utils";

export function Navbar() {
  const router = useRouter();
  const { user } = useUserStore();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed top-0 inset-x-0 z-50 h-16 border-b border-white/10 backdrop-blur-xl bg-black/40"
    >
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/lobby"
          className="flex items-center gap-2 font-bold text-xl tracking-tight text-white"
        >
          <span className="text-2xl">🃏</span>
          <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            Caída
          </span>
        </Link>

        {/* Right side */}
        {user && (
          <div className="flex items-center gap-4">
            {/* Balance */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-400 text-sm font-semibold">
                {formatChips(user.balance)}
              </span>
            </div>

            {/* Username */}
            <span className="text-sm text-white/70">@{user.username}</span>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="text-xs text-white/50 hover:text-white/90 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </motion.nav>
  );
}
