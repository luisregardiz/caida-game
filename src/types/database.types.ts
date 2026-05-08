export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          balance?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          id: string;
          name: string;
          host_id: string;
          bet_amount: number;
          pot: number;
          status: "waiting" | "playing" | "finished";
          max_players: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          host_id: string;
          bet_amount: number;
          pot?: number;
          status?: "waiting" | "playing" | "finished";
          max_players?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          bet_amount?: number;
          pot?: number;
          status?: "waiting" | "playing" | "finished";
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tables_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      table_status: "waiting" | "playing" | "finished";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Table = Database["public"]["Tables"]["tables"]["Row"];
