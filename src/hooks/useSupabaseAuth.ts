"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/config/supabase/client";
import { useUserStore } from "@/store/userStore";

/**
 * Hook that syncs Supabase Auth state with the Zustand user store.
 * Fetches the profile from the `profiles` table after auth state changes.
 *
 * Usage: Call once in a top-level Client Component (e.g., an AuthProvider).
 */
export function useSupabaseAuth() {
  const supabase = createClient();
  const router = useRouter();
  const { setUser, setLoading, clearUser } = useUserStore();

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("[useSupabaseAuth] Error fetching profile:", error.message);
        return;
      }

      setUser(data);
    },
    [supabase, setUser]
  );

  useEffect(() => {
    setLoading(true);

    // Check initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        fetchProfile(user.id).finally(() => setLoading(false));
      } else {
        clearUser();
        setLoading(false);
      }
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        fetchProfile(session.user.id);
        router.refresh();
      } else if (event === "SIGNED_OUT") {
        clearUser();
        router.push("/login");
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile, setLoading, clearUser, router]);
}
