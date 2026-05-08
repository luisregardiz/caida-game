import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile } from "@/types/database.types";

interface UserState {
  user: Profile | null;
  isLoading: boolean;
  setUser: (user: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  updateBalance: (newBalance: number) => void;
  clearUser: () => void;
}

/**
 * Zustand store for authenticated user profile and balance.
 * Persisted to localStorage so the balance survives a page refresh
 * (still synced with Supabase on mount).
 */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      updateBalance: (newBalance) =>
        set((state) =>
          state.user ? { user: { ...state.user, balance: newBalance } } : {}
        ),
      clearUser: () => set({ user: null }),
    }),
    {
      name: "caida-user-store",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
