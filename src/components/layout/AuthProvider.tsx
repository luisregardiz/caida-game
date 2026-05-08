"use client";

import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useSupabaseAuth();
  return <>{children}</>;
}
