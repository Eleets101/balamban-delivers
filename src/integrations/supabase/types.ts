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
      daily_finance_snapshots: {
        Row: {
          cash_collected: number
          company_revenue: number
          created_at: string
          day: string
          gcash_received: number
          generated_by: string
          gross_sales: number
          id: string
          notes: string | null
          pending_settlements_amount: number
          pending_settlements_count: number
          rider_breakdown: Json
          rider_earnings: number
          total_orders: number
        }
        Insert: {
          cash_collected?: number
          company_revenue?: number
          created_at?: string
          day: string
          gcash_received?: number
          generated_by: string
          gross_sales?: number
          id?: string
          notes?: string | null
          pending_settlements_amount?: number
          pending_settlements_count?: number
          rider_breakdown?: Json
          rider_earnings?: number
          total_orders?: number
        }
        Update: {
          cash_collected?: number
          company_revenue?: number
          created_at?: string
          day?: string
          gcash_received?: number
          generated_by?: string
          gross_sales?: number
          id?: string
          notes?: string | null
          pending_settlements_amount?: number
          pending_settlements_count?: number
          rider_breakdown?: Json
          rider_earnings?: number
          total_orders?: number
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          id: string
          lat: number
          lng: number
          order_id: string | null
          rider_id: string
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          lat: number
          lng: number
          order_id?: string | null
          rider_id: string
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          order_id?: string | null
          rider_id?: string
          speed?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      finance_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      ledger_adjustments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          id: string
          note: string
          rider_id: string
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string
          id?: string
          note: string
          rider_id: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          id?: string
          note?: string
          rider_id?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          order_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          order_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          details: Json
          dropoff_address: string
          dropoff_lat: number | null
          dropoff_lng: number | null
          estimated_price: number | null
          id: string
          notes: string | null
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          pickup_address: string
          pickup_lat: number | null
          pickup_lng: number | null
          rider_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          details?: Json
          dropoff_address: string
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          estimated_price?: number | null
          id?: string
          notes?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_address: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          rider_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          details?: Json
          dropoff_address?: string
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          estimated_price?: number | null
          id?: string
          notes?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          rider_id?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          address: string
          base_delivery_fee: number
          category: Database["public"]["Enums"]["restaurant_category"]
          close_time: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          estimated_minutes: number
          free_distance_km: number
          id: string
          is_active: boolean
          is_open: boolean
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          open_hours: string | null
          open_time: string | null
          osm_id: string | null
          per_km_fee: number
          phone: string | null
          rating: number
          review_count: number
          slug: string | null
          sort_order: number
          source: string
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address: string
          base_delivery_fee?: number
          category?: Database["public"]["Enums"]["restaurant_category"]
          close_time?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number
          free_distance_km?: number
          id?: string
          is_active?: boolean
          is_open?: boolean
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          open_hours?: string | null
          open_time?: string | null
          osm_id?: string | null
          per_km_fee?: number
          phone?: string | null
          rating?: number
          review_count?: number
          slug?: string | null
          sort_order?: number
          source?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string
          base_delivery_fee?: number
          category?: Database["public"]["Enums"]["restaurant_category"]
          close_time?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number
          free_distance_km?: number
          id?: string
          is_active?: boolean
          is_open?: boolean
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          open_hours?: string | null
          open_time?: string | null
          osm_id?: string | null
          per_km_fee?: number
          phone?: string | null
          rating?: number
          review_count?: number
          slug?: string | null
          sort_order?: number
          source?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      saved_locations: {
        Row: {
          address: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["saved_location_kind"]
          label: string
          lat: number
          lng: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["saved_location_kind"]
          label: string
          lat: number
          lng: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["saved_location_kind"]
          label?: string
          lat?: number
          lng?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settlements: {
        Row: {
          admin_id: string | null
          amount: number
          approved_at: string | null
          created_at: string
          id: string
          notes: string | null
          receipt_url: string | null
          reference: string | null
          rider_id: string
          status: Database["public"]["Enums"]["settlement_status"]
          type: Database["public"]["Enums"]["settlement_type"]
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          reference?: string | null
          rider_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
          type: Database["public"]["Enums"]["settlement_type"]
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          reference?: string | null
          rider_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          type?: Database["public"]["Enums"]["settlement_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          collected_by: string
          created_at: string
          customer_paid: number
          gcash_to: Database["public"]["Enums"]["gcash_recipient"] | null
          id: string
          order_id: string
          payment_method: string
          platform_commission: number
          rider_earning: number
          rider_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          settled: boolean
        }
        Insert: {
          collected_by: string
          created_at?: string
          customer_paid?: number
          gcash_to?: Database["public"]["Enums"]["gcash_recipient"] | null
          id?: string
          order_id: string
          payment_method: string
          platform_commission?: number
          rider_earning?: number
          rider_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          settled?: boolean
        }
        Update: {
          collected_by?: string
          created_at?: string
          customer_paid?: number
          gcash_to?: Database["public"]["Enums"]["gcash_recipient"] | null
          id?: string
          order_id?: string
          payment_method?: string
          platform_commission?: number
          rider_earning?: number
          rider_id?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          settled?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_order: { Args: { p_order_id: string }; Returns: undefined }
      admin_confirm_payment: {
        Args: { p_confirmed: boolean; p_order_id: string }
        Returns: undefined
      }
      admin_decide_settlement: {
        Args: { p_approve: boolean; p_id: string; p_note: string }
        Returns: undefined
      }
      admin_record_settlement: {
        Args: {
          p_amount: number
          p_note: string
          p_rider_id: string
          p_type: Database["public"]["Enums"]["settlement_type"]
        }
        Returns: string
      }
      advance_trip: {
        Args: { p_next_stage: string; p_order_id: string }
        Returns: undefined
      }
      cancel_my_order: {
        Args: {
          p_note: string
          p_order_id: string
          p_reason: string
          p_reason_label: string
        }
        Returns: undefined
      }
      create_order: {
        Args: {
          p_details: Json
          p_dropoff_address: string
          p_dropoff_lat: number
          p_dropoff_lng: number
          p_estimated_price: number
          p_notes: string
          p_pickup_address: string
          p_pickup_lat: number
          p_pickup_lng: number
          p_service_type: Database["public"]["Enums"]["service_type"]
        }
        Returns: string
      }
      get_order_contacts: {
        Args: { p_order_id: string }
        Returns: {
          customer_name: string
          customer_phone: string
          rider_avatar_url: string
          rider_name: string
          rider_phone: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hg_audit: {
        Args: {
          _action: string
          _details: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
      hg_haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      hg_min_fee: {
        Args: {
          _details: Json
          _km: number
          _service: Database["public"]["Enums"]["service_type"]
        }
        Returns: number
      }
      hg_next_trip_stage: { Args: { _current: string }; Returns: string }
      list_available_jobs: {
        Args: never
        Returns: {
          created_at: string
          details: Json
          dropoff_address: string
          dropoff_lat: number
          dropoff_lng: number
          estimated_price: number
          id: string
          payment_method: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      rider_cancel_settlement: { Args: { p_id: string }; Returns: undefined }
      set_order_payment_method: {
        Args: { p_method: string; p_order_id: string; p_reference?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "rider" | "vendor" | "customer"
      gcash_recipient: "hatodgo" | "rider"
      order_status:
        | "pending"
        | "accepted"
        | "in_progress"
        | "completed"
        | "cancelled"
      payment_status: "pending" | "paid" | "cod" | "failed"
      restaurant_category:
        | "carenderia"
        | "fast_food"
        | "snacks"
        | "drinks"
        | "pharmacy"
        | "grocery"
        | "bakery"
        | "other"
      saved_location_kind: "home" | "work" | "favorite"
      service_type: "food" | "padali" | "pabili" | "ride"
      settlement_status: "pending" | "approved" | "rejected"
      settlement_type: "cash_remit" | "gcash_to_hatodgo" | "payout_to_rider"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "rider", "vendor", "customer"],
      gcash_recipient: ["hatodgo", "rider"],
      order_status: [
        "pending",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
      ],
      payment_status: ["pending", "paid", "cod", "failed"],
      restaurant_category: [
        "carenderia",
        "fast_food",
        "snacks",
        "drinks",
        "pharmacy",
        "grocery",
        "bakery",
        "other",
      ],
      saved_location_kind: ["home", "work", "favorite"],
      service_type: ["food", "padali", "pabili", "ride"],
      settlement_status: ["pending", "approved", "rejected"],
      settlement_type: ["cash_remit", "gcash_to_hatodgo", "payout_to_rider"],
    },
  },
} as const
