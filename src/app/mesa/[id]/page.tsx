import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/config/supabase/server";
import { Navbar } from "@/components/layout/Navbar";

import type { Table } from "@/types/database.types";
import { TableClient } from "./TableClient";

interface MesaPageProps {
  params: Promise<{ id: string }>;
}

export default async function MesaPage({ params }: MesaPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let table: Table | null = null;

  if (id === "singleplayer") {
    table = {
      id: "singleplayer",
      name: "Single Player vs CPU",
      host_id: user.id,
      bet_amount: 0,
      pot: 0,
      status: "playing",
      max_players: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Table;
  } else {
    // Fetch table data
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error || !data) notFound();
    table = data as Table;
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        <TableClient table={table as Table} currentUserId={user.id} />
      </main>
    </>
  );
}
