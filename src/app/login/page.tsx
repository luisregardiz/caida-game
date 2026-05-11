"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Send } from "lucide-react";
import { createClient } from "@/config/supabase/client";
import { usernameFromEmail, getAvatarUrl } from "@/lib/utils";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/lobby");
        router.refresh();
      } else {
        // Register
        const username = usernameFromEmail(email);
        const avatarUrl = getAvatarUrl(username);

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, avatar_url: avatarUrl },
          },
        });
        if (error) throw error;
        // Profile creation is handled by a DB trigger (see SQL migration)
        router.push("/lobby");
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError("Ingresa tu correo electrónico primero.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setIsLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMagicSent(true);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 felt-bg opacity-60" />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-4"
      >
        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🃏</div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Caída
            </h1>
            <p className="text-white/50 text-sm mt-1">
              {mode === "login" ? "Inicia sesión para jugar" : "Crea tu cuenta"}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-white/10 mb-6">
            {(["login", "register"] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  mode === m
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {m === "login" ? "Iniciar Sesión" : "Registrarse"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {magicSent ? (
              <motion.div
                key="magic-sent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-6"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-white/80 font-medium">¡Revisa tu correo!</p>
                <p className="text-white/50 text-sm mt-1">
                  Te enviamos un enlace mágico a <strong>{email}</strong>
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleAuth}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-white/60 mb-1.5">
                    Correo Electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-white/60 mb-1.5">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm"
                  />
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-red-400 text-xs text-center py-1"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  id="auth-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading
                    ? "Cargando..."
                    : mode === "login"
                    ? "Iniciar Sesión"
                    : "Crear Cuenta"}
                </button>

                <div className="relative flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-white/30">o</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  id="magic-link-btn"
                  type="button"
                  onClick={handleMagicLink}
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl font-medium text-sm border border-white/10 text-white/60 hover:bg-white/5 hover:text-white/80 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar Magic Link
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </main>
  );
}
