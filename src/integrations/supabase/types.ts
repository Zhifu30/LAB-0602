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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      admin_verifications: {
        Row: {
          admin_id: string
          expires_at: string | null
          id: string
          verified_at: string | null
        }
        Insert: {
          admin_id: string
          expires_at?: string | null
          id?: string
          verified_at?: string | null
        }
        Update: {
          admin_id?: string
          expires_at?: string | null
          id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          timestamp: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          action: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          timestamp?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          action?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          timestamp?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          from_email: string
          from_name: string | null
          id: string
          smtp_host: string
          smtp_password: string
          smtp_port: string
          smtp_user: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          from_email: string
          from_name?: string | null
          id?: string
          smtp_host?: string
          smtp_password: string
          smtp_port?: string
          smtp_user: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          from_email?: string
          from_name?: string | null
          id?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: string
          smtp_user?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      empower_projects: {
        Row: {
          abbreviation: string | null
          approved_project_name: string | null
          created_at: string
          id: string
          leader_check: string | null
          manager_approve: string | null
          new_project: boolean | null
          notify_owner: string | null
          owner_name: string
          owner_number: string
          project_name: string
          team: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          approved_project_name?: string | null
          created_at?: string
          id?: string
          leader_check?: string | null
          manager_approve?: string | null
          new_project?: boolean | null
          notify_owner?: string | null
          owner_name: string
          owner_number: string
          project_name: string
          team: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          approved_project_name?: string | null
          created_at?: string
          id?: string
          leader_check?: string | null
          manager_approve?: string | null
          new_project?: boolean | null
          notify_owner?: string | null
          owner_name?: string
          owner_number?: string
          project_name?: string
          team?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empower_projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          calibration_date: string | null
          calibration_reminder_sent: boolean | null
          created_at: string | null
          id: string
          image_url: string | null
          is_scrapped: boolean | null
          location: string
          maintenance_date: string | null
          manufacturer: string
          model: string
          name: string
          next_calibration_date: string | null
          notes: string | null
          responsible: string
          responsible_email: string | null
          scrapped_at: string | null
          scrapped_by: string | null
          sop_file_name: string | null
          sop_file_url: string | null
          sop_files: Json | null
          status: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          calibration_date?: string | null
          calibration_reminder_sent?: boolean | null
          created_at?: string | null
          id: string
          image_url?: string | null
          is_scrapped?: boolean | null
          location: string
          maintenance_date?: string | null
          manufacturer: string
          model: string
          name: string
          next_calibration_date?: string | null
          notes?: string | null
          responsible: string
          responsible_email?: string | null
          scrapped_at?: string | null
          scrapped_by?: string | null
          sop_file_name?: string | null
          sop_file_url?: string | null
          sop_files?: Json | null
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          calibration_date?: string | null
          calibration_reminder_sent?: boolean | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_scrapped?: boolean | null
          location?: string
          maintenance_date?: string | null
          manufacturer?: string
          model?: string
          name?: string
          next_calibration_date?: string | null
          notes?: string | null
          responsible?: string
          responsible_email?: string | null
          scrapped_at?: string | null
          scrapped_by?: string | null
          sop_file_name?: string | null
          sop_file_url?: string | null
          sop_files?: Json | null
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      equipment_templates: {
        Row: {
          created_at: string
          equipment_type: string
          id: string
          manufacturer: string
          model: string
          shared_image_url: string | null
          shared_sop_files: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipment_type: string
          id?: string
          manufacturer: string
          model: string
          shared_image_url?: string | null
          shared_sop_files?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipment_type?: string
          id?: string
          manufacturer?: string
          model?: string
          shared_image_url?: string | null
          shared_sop_files?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      fault_reports: {
        Row: {
          created_at: string
          custom_reason: string | null
          description: string | null
          equipment_id: string
          id: string
          image_url: string | null
          reason: string
          reported_by: string | null
          reporter_name: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          custom_reason?: string | null
          description?: string | null
          equipment_id: string
          id?: string
          image_url?: string | null
          reason: string
          reported_by?: string | null
          reporter_name: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          custom_reason?: string | null
          description?: string | null
          equipment_id?: string
          id?: string
          image_url?: string | null
          reason?: string
          reported_by?: string | null
          reporter_name?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fault_reports_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string
          created_at: string | null
          equipment_id: string
          id: string
          notes: string | null
          schedule_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name: string
          created_at?: string | null
          equipment_id: string
          id?: string
          notes?: string | null
          schedule_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string
          created_at?: string | null
          equipment_id?: string
          id?: string
          notes?: string | null
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "maintenance_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedules: {
        Row: {
          assigned_email: string | null
          assigned_name: string | null
          assigned_user_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          equipment_id: string
          frequency: string
          id: string
          is_active: boolean | null
          last_completed_at: string | null
          next_due_date: string
          reminder_days_before: number
          reminder_sent: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_email?: string | null
          assigned_name?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          equipment_id: string
          frequency: string
          id?: string
          is_active?: boolean | null
          last_completed_at?: string | null
          next_due_date: string
          reminder_days_before?: number
          reminder_sent?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_email?: string | null
          assigned_name?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          equipment_id?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_completed_at?: string | null
          next_due_date?: string
          reminder_days_before?: number
          reminder_sent?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      part_transactions: {
        Row: {
          created_at: string
          equipment_id: string | null
          id: string
          notes: string | null
          part_id: string
          quantity: number
          signature: string | null
          transaction_date: string
          type: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          equipment_id?: string | null
          id?: string
          notes?: string | null
          part_id: string
          quantity: number
          signature?: string | null
          transaction_date?: string
          type: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          equipment_id?: string | null
          id?: string
          notes?: string | null
          part_id?: string
          quantity?: number
          signature?: string | null
          transaction_date?: string
          type?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_transactions_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_transactions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_usage: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          notes: string | null
          part_id: string
          quantity: number
          signature: string | null
          usage_date: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id?: string
          notes?: string | null
          part_id: string
          quantity: number
          signature?: string | null
          usage_date?: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          notes?: string | null
          part_id?: string
          quantity?: number
          signature?: string | null
          usage_date?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_usage_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_usage_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          barcode: string
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          location: string | null
          min_stock_level: number | null
          name: string
          purchase_files: Json | null
          quantity_per_vial: number | null
          remaining_stock: number
          serial_number: string | null
          supplier: string | null
          total_stock: number
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          barcode: string
          category: string
          created_at?: string
          description?: string | null
          id: string
          image_url?: string | null
          location?: string | null
          min_stock_level?: number | null
          name: string
          purchase_files?: Json | null
          quantity_per_vial?: number | null
          remaining_stock?: number
          serial_number?: string | null
          supplier?: string | null
          total_stock?: number
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          barcode?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          min_stock_level?: number | null
          name?: string
          purchase_files?: Json | null
          quantity_per_vial?: number | null
          remaining_stock?: number
          serial_number?: string | null
          supplier?: string | null
          total_stock?: number
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string | null
          description: string
          id: string
          name: string
          Remark: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          id?: string
          name: string
          Remark?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          name?: string
          Remark?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          notes: string | null
          role: string
          role_type: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          role?: string
          role_type?: string | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          role?: string
          role_type?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      registration_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          email: string
          id: string
          rejection_reason: string | null
          requested_at: string
          status: string
          username: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          email: string
          id?: string
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          username: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          email?: string
          id?: string
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          username?: string
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          equipment_id: string
          id: string
          recipient_email: string
          reminder_type: string
          sent_at: string
          status: string
        }
        Insert: {
          equipment_id: string
          id?: string
          recipient_email: string
          reminder_type: string
          sent_at?: string
          status?: string
        }
        Update: {
          equipment_id?: string
          id?: string
          recipient_email?: string
          reminder_type?: string
          sent_at?: string
          status?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          granted: boolean | null
          id: string
          permission_id: string | null
          role_type: string
        }
        Insert: {
          created_at?: string | null
          granted?: boolean | null
          id?: string
          permission_id?: string | null
          role_type: string
        }
        Update: {
          created_at?: string | null
          granted?: boolean | null
          id?: string
          permission_id?: string | null
          role_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      scrap_records: {
        Row: {
          admin_password: string
          approval_notes: string | null
          approved_by: string | null
          created_at: string
          equipment_id: string
          id: string
          reason: string
          scrapped_by: string | null
          scrapper_name: string
        }
        Insert: {
          admin_password: string
          approval_notes?: string | null
          approved_by?: string | null
          created_at?: string
          equipment_id: string
          id?: string
          reason: string
          scrapped_by?: string | null
          scrapper_name: string
        }
        Update: {
          admin_password?: string
          approval_notes?: string | null
          approved_by?: string | null
          created_at?: string
          equipment_id?: string
          id?: string
          reason?: string
          scrapped_by?: string | null
          scrapper_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrap_records_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          id: string
          name: string
          scientist_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          scientist_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          scientist_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_admin_users: {
        Args: never
        Returns: {
          email: string
          user_id: string
          username: string
        }[]
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      set_admin_role: { Args: { user_email: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
