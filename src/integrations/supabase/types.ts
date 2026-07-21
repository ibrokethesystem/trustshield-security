export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      child_activity: {
        Row: {
          blocked: boolean
          created_at: string
          host: string
          id: string
          risk: number
          url: string
          user_id: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          host: string
          id?: string
          risk?: number
          url: string
          user_id: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          host?: string
          id?: string
          risk?: number
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      child_banned_sites: {
        Row: {
          created_at: string
          host: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          host: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          host?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      child_links: {
        Row: {
          child_email: string | null
          child_id: string
          created_at: string
          deleted_at: string | null
          id: string
          label: string | null
          parent_id: string
        }
        Insert: {
          child_email?: string | null
          child_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string | null
          parent_id: string
        }
        Update: {
          child_email?: string | null
          child_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string | null
          parent_id?: string
        }
        Relationships: []
      }
      permission_requests: {
        Row: {
          child_id: string
          created_at: string
          id: string
          kind: string
          note: string | null
          parent_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          parent_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          parent_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scan_history: {
        Row: {
          created_at: string
          had_image: boolean
          id: string
          risk_level: string | null
          risk_score: number
          snippet: string | null
          summary: string | null
          threat_id: string | null
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          had_image?: boolean
          id?: string
          risk_level?: string | null
          risk_score?: number
          snippet?: string | null
          summary?: string | null
          threat_id?: string | null
          user_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          had_image?: boolean
          id?: string
          risk_level?: string | null
          risk_score?: number
          snippet?: string | null
          summary?: string | null
          threat_id?: string | null
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_history_threat_id_fkey"
            columns: ["threat_id"]
            isOneToOne: false
            referencedRelation: "threats"
            referencedColumns: ["id"]
          },
        ]
      }
      threats: {
        Row: {
          created_at: string
          description: string | null
          details: Json
          id: string
          severity: Database["public"]["Enums"]["threat_severity"]
          source: string | null
          status: Database["public"]["Enums"]["threat_status"]
          threat_type: Database["public"]["Enums"]["threat_type"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          details?: Json
          id?: string
          severity?: Database["public"]["Enums"]["threat_severity"]
          source?: string | null
          status?: Database["public"]["Enums"]["threat_status"]
          threat_type?: Database["public"]["Enums"]["threat_type"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          details?: Json
          id?: string
          severity?: Database["public"]["Enums"]["threat_severity"]
          source?: string | null
          status?: Database["public"]["Enums"]["threat_status"]
          threat_type?: Database["public"]["Enums"]["threat_type"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_entries: {
        Row: {
          created_at: string
          id: string
          label: string
          notes: string
          password: string
          updated_at: string
          url: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          notes?: string
          password: string
          updated_at?: string
          url?: string
          user_id: string
          username?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          notes?: string
          password?: string
          updated_at?: string
          url?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      vault_settings: {
        Row: {
          created_at: string
          lock_enabled: boolean
          pin_hash: string | null
          pin_salt: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lock_enabled?: boolean
          pin_hash?: string | null
          pin_salt?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lock_enabled?: boolean
          pin_hash?: string | null
          pin_salt?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          detections: number
          id: string
          label: string
          last_checked_at: string | null
          notes: string
          sources: Json
          status: Database["public"]["Enums"]["watchlist_status"]
          target: string
          target_type: Database["public"]["Enums"]["watchlist_target_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detections?: number
          id?: string
          label?: string
          last_checked_at?: string | null
          notes?: string
          sources?: Json
          status?: Database["public"]["Enums"]["watchlist_status"]
          target: string
          target_type: Database["public"]["Enums"]["watchlist_target_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detections?: number
          id?: string
          label?: string
          last_checked_at?: string | null
          notes?: string
          sources?: Json
          status?: Database["public"]["Enums"]["watchlist_status"]
          target?: string
          target_type?: Database["public"]["Enums"]["watchlist_target_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_siblings: {
        Args: { _child: string }
        Returns: {
          child_email: string
          child_id: string
          label: string
        }[]
      }
      is_parent_of: { Args: { _child: string }; Returns: boolean }
      list_child_emails_for_parent: {
        Args: { _parent_email: string }
        Returns: {
          child_email: string
        }[]
      }
    }
    Enums: {
      threat_severity: "low" | "medium" | "high" | "critical"
      threat_status: "active" | "dismissed" | "blocked"
      threat_type: "phishing" | "scam" | "hack" | "suspicious_link" | "other"
      watchlist_status:
        | "pending"
        | "clean"
        | "suspicious"
        | "malicious"
        | "error"
      watchlist_target_type: "domain" | "ip"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      threat_severity: ["low", "medium", "high", "critical"],
      threat_status: ["active", "dismissed", "blocked"],
      threat_type: ["phishing", "scam", "hack", "suspicious_link", "other"],
      watchlist_status: [
        "pending",
        "clean",
        "suspicious",
        "malicious",
        "error",
      ],
      watchlist_target_type: ["domain", "ip"],
    },
  },
} as const
