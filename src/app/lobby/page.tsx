import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/config/supabase/server";
import { Navbar } from "@/components/layout/Navbar";

import type { Table } from "@/types/database.types";
import { LobbyClient } from "./LobbyClient";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch open tables
  const { data: tables, error } = await supabase
    .from("tables")
    .select("*")
    .eq("status", "waiting")
    .order("created_at", { ascending: false });

  if (error) console.error("[Lobby] Error fetching tables:", error.message);

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-12 px-4">
        <div className="max-w-6xl mx-auto">
          <LobbyClient initialTables={(tables as Table[]) ?? []} />
        </div>
      </main>
    </>
  );
}
