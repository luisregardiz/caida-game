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

  // Fetch table data
  const { data: table, error } = await supabase
    .from("tables")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !table) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        <TableClient table={table as Table} currentUserId={user.id} />
      </main>
    </>
  );
}
