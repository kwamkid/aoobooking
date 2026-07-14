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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          hotel_id: string | null
          id: string
          new_data: Json | null
          note: string | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hotel_id?: string | null
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hotel_id?: string | null
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rooms: {
        Row: {
          booking_id: string
          created_at: string
          end_date: string
          hotel_id: string
          id: string
          nights: number
          price_per_night_satang: number
          property_id: string
          rate_plan_id: string
          room_id: string | null
          room_type_id: string
          start_date: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          end_date: string
          hotel_id: string
          id?: string
          nights: number
          price_per_night_satang: number
          property_id: string
          rate_plan_id: string
          room_id?: string | null
          room_type_id: string
          start_date: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          end_date?: string
          hotel_id?: string
          id?: string
          nights?: number
          price_per_night_satang?: number
          property_id?: string
          rate_plan_id?: string
          room_id?: string | null
          room_type_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_balances"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rooms_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          cancel_reason: string | null
          cancelled_at: string | null
          channel: Database["public"]["Enums"]["booking_channel"]
          check_in: string
          check_out: string
          children: number
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deposit_due_satang: number
          fx_rate_to_base: number
          guest_id: string | null
          hold_expires_at: string | null
          hotel_id: string
          id: string
          no_show_at: string | null
          note: string | null
          property_id: string
          status: Database["public"]["Enums"]["booking_status"]
          total_satang: number
          updated_at: string
        }
        Insert: {
          adults?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          check_in: string
          check_out: string
          children?: number
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_due_satang?: number
          fx_rate_to_base?: number
          guest_id?: string | null
          hold_expires_at?: string | null
          hotel_id: string
          id?: string
          no_show_at?: string | null
          note?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_satang?: number
          updated_at?: string
        }
        Update: {
          adults?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          check_in?: string
          check_out?: string
          children?: number
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_due_satang?: number
          fx_rate_to_base?: number
          guest_id?: string | null
          hold_expires_at?: string | null
          hotel_id?: string
          id?: string
          no_show_at?: string | null
          note?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_satang?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      folio_items: {
        Row: {
          amount_satang: number
          category: Database["public"]["Enums"]["folio_item_category"]
          created_at: string
          description: string
          folio_id: string
          hotel_id: string
          id: string
          posted_by: string | null
          qty: number
          service_charge_satang: number
          unit_price_satang: number
          vat_satang: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_satang: number
          category?: Database["public"]["Enums"]["folio_item_category"]
          created_at?: string
          description: string
          folio_id: string
          hotel_id: string
          id?: string
          posted_by?: string | null
          qty?: number
          service_charge_satang?: number
          unit_price_satang: number
          vat_satang?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_satang?: number
          category?: Database["public"]["Enums"]["folio_item_category"]
          created_at?: string
          description?: string
          folio_id?: string
          hotel_id?: string
          id?: string
          posted_by?: string | null
          qty?: number
          service_charge_satang?: number
          unit_price_satang?: number
          vat_satang?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folio_items_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_items_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_items_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folios: {
        Row: {
          booking_id: string
          created_at: string
          currency: string
          hotel_id: string
          id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          currency?: string
          hotel_id: string
          id?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          currency?: string
          hotel_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folios_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "booking_balances"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "folios_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string
          dob: string | null
          email: string | null
          full_name: string
          hotel_id: string
          id: string
          id_number: string | null
          id_photo_path: string | null
          id_type: Database["public"]["Enums"]["guest_id_type"] | null
          locale: string | null
          nationality: string | null
          note: string | null
          pdpa_consent_at: string | null
          pdpa_consent_by: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name: string
          hotel_id: string
          id?: string
          id_number?: string | null
          id_photo_path?: string | null
          id_type?: Database["public"]["Enums"]["guest_id_type"] | null
          locale?: string | null
          nationality?: string | null
          note?: string | null
          pdpa_consent_at?: string | null
          pdpa_consent_by?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name?: string
          hotel_id?: string
          id?: string
          id_number?: string | null
          id_photo_path?: string | null
          id_type?: Database["public"]["Enums"]["guest_id_type"] | null
          locale?: string | null
          nationality?: string | null
          note?: string | null
          pdpa_consent_at?: string | null
          pdpa_consent_by?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_pdpa_consent_by_fkey"
            columns: ["pdpa_consent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_members: {
        Row: {
          hotel_id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["hotel_role"]
          user_id: string
        }
        Insert: {
          hotel_id: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["hotel_role"]
          user_id: string
        }
        Update: {
          hotel_id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["hotel_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_members_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_package_overrides: {
        Row: {
          allow_advanced_reports_override: boolean | null
          allow_booking_engine_override: boolean | null
          allow_channel_manager_override: boolean | null
          allow_custom_domain_override: boolean | null
          allow_dynamic_pricing_override: boolean | null
          created_at: string
          expires_at: string | null
          granted_by: string | null
          hotel_id: string
          max_ota_channels_override: number | null
          max_properties_override: number | null
          max_rooms_override: number | null
          max_team_members_override: number | null
          reason: string | null
          remove_branding_override: boolean | null
        }
        Insert: {
          allow_advanced_reports_override?: boolean | null
          allow_booking_engine_override?: boolean | null
          allow_channel_manager_override?: boolean | null
          allow_custom_domain_override?: boolean | null
          allow_dynamic_pricing_override?: boolean | null
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          hotel_id: string
          max_ota_channels_override?: number | null
          max_properties_override?: number | null
          max_rooms_override?: number | null
          max_team_members_override?: number | null
          reason?: string | null
          remove_branding_override?: boolean | null
        }
        Update: {
          allow_advanced_reports_override?: boolean | null
          allow_booking_engine_override?: boolean | null
          allow_channel_manager_override?: boolean | null
          allow_custom_domain_override?: boolean | null
          allow_dynamic_pricing_override?: boolean | null
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          hotel_id?: string
          max_ota_channels_override?: number | null
          max_properties_override?: number | null
          max_rooms_override?: number | null
          max_team_members_override?: number | null
          reason?: string | null
          remove_branding_override?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_package_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_package_overrides_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          accepted_currencies: string[]
          base_currency: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string
          package_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          accepted_currencies?: string[]
          base_currency?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          package_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          accepted_currencies?: string[]
          base_currency?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          package_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotels_package_fk"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          expires_at: string | null
          hotel_id: string
          id: string
          invited_by: string
          max_uses: number
          role: Database["public"]["Enums"]["hotel_role"]
          token: string
          used_count: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          hotel_id: string
          id?: string
          invited_by: string
          max_uses?: number
          role?: Database["public"]["Enums"]["hotel_role"]
          token: string
          used_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          hotel_id?: string
          id?: string
          invited_by?: string
          max_uses?: number
          role?: Database["public"]["Enums"]["hotel_role"]
          token?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_satang: number
          beam_charge_id: string | null
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          created_at: string
          created_by: string | null
          currency: string
          hotel_id: string
          id: string
          package_id: string
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["saas_payment_method"]
          qr_expiry: string | null
          raw: Json | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
          vat_satang: number
        }
        Insert: {
          amount_satang: number
          beam_charge_id?: string | null
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          created_by?: string | null
          currency?: string
          hotel_id: string
          id?: string
          package_id: string
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["saas_payment_method"]
          qr_expiry?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          vat_satang?: number
        }
        Update: {
          amount_satang?: number
          beam_charge_id?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          created_by?: string | null
          currency?: string
          hotel_id?: string
          id?: string
          package_id?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["saas_payment_method"]
          qr_expiry?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          vat_satang?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          allow_advanced_reports: boolean
          allow_booking_engine: boolean
          allow_channel_manager: boolean
          allow_custom_domain: boolean
          allow_dynamic_pricing: boolean
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          max_ota_channels: number | null
          max_properties: number | null
          max_rooms: number | null
          max_team_members: number | null
          name: string
          price_thb_monthly: number | null
          price_thb_yearly: number | null
          remove_branding: boolean
          slug: string
          sort_order: number
        }
        Insert: {
          allow_advanced_reports?: boolean
          allow_booking_engine?: boolean
          allow_channel_manager?: boolean
          allow_custom_domain?: boolean
          allow_dynamic_pricing?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_ota_channels?: number | null
          max_properties?: number | null
          max_rooms?: number | null
          max_team_members?: number | null
          name: string
          price_thb_monthly?: number | null
          price_thb_yearly?: number | null
          remove_branding?: boolean
          slug: string
          sort_order?: number
        }
        Update: {
          allow_advanced_reports?: boolean
          allow_booking_engine?: boolean
          allow_channel_manager?: boolean
          allow_custom_domain?: boolean
          allow_dynamic_pricing?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_ota_channels?: number | null
          max_properties?: number | null
          max_rooms?: number | null
          max_team_members?: number | null
          name?: string
          price_thb_monthly?: number | null
          price_thb_yearly?: number | null
          remove_branding?: boolean
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_base_satang: number
          amount_satang: number
          booking_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          direction: Database["public"]["Enums"]["payment_direction"]
          fx_rate_to_base: number
          gateway_ref: string | null
          hotel_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          received_by: string | null
          reference_payment_id: string | null
          slip_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount_base_satang: number
          amount_satang: number
          booking_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          fx_rate_to_base?: number
          gateway_ref?: string | null
          hotel_id: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          received_by?: string | null
          reference_payment_id?: string | null
          slip_path?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount_base_satang?: number
          amount_satang?: number
          booking_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          fx_rate_to_base?: number
          gateway_ref?: string | null
          hotel_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          received_by?: string | null
          reference_payment_id?: string | null
          slip_path?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_balances"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reference_payment_id_fkey"
            columns: ["reference_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_super_admin: boolean
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          free_months: number
          id: string
          is_active: boolean
          max_uses: number | null
          note: string | null
          package_id: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          free_months: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          note?: string | null
          package_id: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          free_months?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          note?: string | null
          package_id?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          business_day_cutoff: string
          check_in_time: string
          check_out_time: string
          created_at: string
          default_currency: string | null
          deleted_at: string | null
          hotel_id: string
          id: string
          is_active: boolean
          name: string
          night_audit_mode: string
          phone: string | null
          service_charge_percent: number
          slug: string
          tax_inclusive: boolean
          timezone: string
          updated_at: string
          vat_percent: number
        }
        Insert: {
          address?: string | null
          business_day_cutoff?: string
          check_in_time?: string
          check_out_time?: string
          created_at?: string
          default_currency?: string | null
          deleted_at?: string | null
          hotel_id: string
          id?: string
          is_active?: boolean
          name: string
          night_audit_mode?: string
          phone?: string | null
          service_charge_percent?: number
          slug: string
          tax_inclusive?: boolean
          timezone?: string
          updated_at?: string
          vat_percent?: number
        }
        Update: {
          address?: string | null
          business_day_cutoff?: string
          check_in_time?: string
          check_out_time?: string
          created_at?: string
          default_currency?: string | null
          deleted_at?: string | null
          hotel_id?: string
          id?: string
          is_active?: boolean
          name?: string
          night_audit_mode?: string
          phone?: string | null
          service_charge_percent?: number
          slug?: string
          tax_inclusive?: boolean
          timezone?: string
          updated_at?: string
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "properties_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_plans: {
        Row: {
          cancellation_policy: Json
          created_at: string
          deleted_at: string | null
          deposit_policy: Json
          description: string | null
          hotel_id: string
          id: string
          include_breakfast: boolean
          is_active: boolean
          name: string
          property_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cancellation_policy?: Json
          created_at?: string
          deleted_at?: string | null
          deposit_policy?: Json
          description?: string | null
          hotel_id: string
          id?: string
          include_breakfast?: boolean
          is_active?: boolean
          name: string
          property_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cancellation_policy?: Json
          created_at?: string
          deleted_at?: string | null
          deposit_policy?: Json
          description?: string | null
          hotel_id?: string
          id?: string
          include_breakfast?: boolean
          is_active?: boolean
          name?: string
          property_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_prices: {
        Row: {
          closed: boolean
          created_at: string
          currency: string
          date: string
          hotel_id: string
          id: string
          min_stay: number
          price_satang: number
          rate_plan_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          closed?: boolean
          created_at?: string
          currency?: string
          date: string
          hotel_id: string
          id?: string
          min_stay?: number
          price_satang: number
          rate_plan_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          closed?: boolean
          created_at?: string
          currency?: string
          date?: string
          hotel_id?: string
          id?: string
          min_stay?: number
          price_satang?: number
          rate_plan_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_prices_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_prices_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_prices_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission_presets: {
        Row: {
          allowed: boolean
          permission: string
          role: Database["public"]["Enums"]["hotel_role"]
        }
        Insert: {
          allowed: boolean
          permission: string
          role: Database["public"]["Enums"]["hotel_role"]
        }
        Update: {
          allowed?: boolean
          permission?: string
          role?: Database["public"]["Enums"]["hotel_role"]
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          allowed: boolean
          hotel_id: string
          permission: string
          role: Database["public"]["Enums"]["hotel_role"]
        }
        Insert: {
          allowed: boolean
          hotel_id: string
          permission: string
          role: Database["public"]["Enums"]["hotel_role"]
        }
        Update: {
          allowed?: boolean
          hotel_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["hotel_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      room_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          hotel_id: string
          id: string
          note: string | null
          property_id: string
          reason: Database["public"]["Enums"]["room_block_reason"]
          room_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          hotel_id: string
          id?: string
          note?: string | null
          property_id: string
          reason?: Database["public"]["Enums"]["room_block_reason"]
          room_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          hotel_id?: string
          id?: string
          note?: string | null
          property_id?: string
          reason?: Database["public"]["Enums"]["room_block_reason"]
          room_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_blocks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_blocks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_type_inventory: {
        Row: {
          blocked: number
          booked: number
          date: string
          hotel_id: string
          id: string
          property_id: string
          room_type_id: string
          total: number
          updated_at: string
        }
        Insert: {
          blocked?: number
          booked?: number
          date: string
          hotel_id: string
          id?: string
          property_id: string
          room_type_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          blocked?: number
          booked?: number
          date?: string
          hotel_id?: string
          id?: string
          property_id?: string
          room_type_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_type_inventory_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_inventory_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_inventory_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          amenities: Json
          base_occupancy: number
          child_age_limit: number
          created_at: string
          deleted_at: string | null
          description: string | null
          extra_adult_satang: number
          extra_child_satang: number
          hotel_id: string
          id: string
          is_active: boolean
          max_occupancy: number
          name: string
          photos: Json
          property_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          amenities?: Json
          base_occupancy?: number
          child_age_limit?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          extra_adult_satang?: number
          extra_child_satang?: number
          hotel_id: string
          id?: string
          is_active?: boolean
          max_occupancy?: number
          name: string
          photos?: Json
          property_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amenities?: Json
          base_occupancy?: number
          child_age_limit?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          extra_adult_satang?: number
          extra_child_satang?: number
          hotel_id?: string
          id?: string
          is_active?: boolean
          max_occupancy?: number
          name?: string
          photos?: Json
          property_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_types_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          deleted_at: string | null
          floor: string | null
          hotel_id: string
          housekeeping_status: Database["public"]["Enums"]["housekeeping_status"]
          id: string
          is_active: boolean
          property_id: string
          room_number: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          floor?: string | null
          hotel_id: string
          housekeeping_status?: Database["public"]["Enums"]["housekeeping_status"]
          id?: string
          is_active?: boolean
          property_id: string
          room_number: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          floor?: string | null
          hotel_id?: string
          housekeeping_status?: Database["public"]["Enums"]["housekeeping_status"]
          id?: string
          is_active?: boolean
          property_id?: string
          room_number?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          created_at: string
          current_period_end: string
          grace_until: string | null
          hotel_id: string
          id: string
          last_reminder_day: number | null
          package_id: string
          scheduled_cycle: Database["public"]["Enums"]["billing_cycle"] | null
          scheduled_package_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          current_period_end: string
          grace_until?: string | null
          hotel_id: string
          id?: string
          last_reminder_day?: number | null
          package_id: string
          scheduled_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          scheduled_package_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          current_period_end?: string
          grace_until?: string | null
          hotel_id?: string
          id?: string
          last_reminder_day?: number | null
          package_id?: string
          scheduled_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          scheduled_package_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: true
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_scheduled_package_id_fkey"
            columns: ["scheduled_package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      booking_balances: {
        Row: {
          balance_satang: number | null
          booking_id: string | null
          folio_charges_satang: number | null
          hotel_id: string | null
          paid_satang: number | null
          total_satang: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      guests_safe: {
        Row: {
          created_at: string | null
          dob: string | null
          email: string | null
          full_name: string | null
          hotel_id: string | null
          id: string | null
          id_type: Database["public"]["Enums"]["guest_id_type"] | null
          locale: string | null
          nationality: string | null
          note: string | null
          pdpa_consent_at: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string | null
          hotel_id?: string | null
          id?: string | null
          id_type?: Database["public"]["Enums"]["guest_id_type"] | null
          locale?: string | null
          nationality?: string | null
          note?: string | null
          pdpa_consent_at?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string | null
          hotel_id?: string | null
          id?: string | null
          id_type?: Database["public"]["Enums"]["guest_id_type"] | null
          locale?: string | null
          nationality?: string | null
          note?: string | null
          pdpa_consent_at?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _start_trial: {
        Args: {
          p_hotel_id: string
          p_months: number
          p_package_id: string
          p_reason: string
        }
        Returns: string
      }
      accept_invite: { Args: { p_token: string }; Returns: string }
      apply_package_change: {
        Args: { p_hotel_id: string; p_package_id: string; p_reason: string }
        Returns: undefined
      }
      can_edit_hotel: { Args: { p_hotel_id: string }; Returns: boolean }
      can_manage_hotel: { Args: { p_hotel_id: string }; Returns: boolean }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      check_in_booking: {
        Args: { p_booking_id: string; p_room_assignments?: Json }
        Returns: undefined
      }
      check_out_booking: { Args: { p_booking_id: string }; Returns: undefined }
      check_package_fits: {
        Args: { p_hotel_id: string; p_package_id: string }
        Returns: string[]
      }
      create_booking: {
        Args: {
          p_adults: number
          p_channel?: Database["public"]["Enums"]["booking_channel"]
          p_check_in: string
          p_check_out: string
          p_children: number
          p_guest: Json
          p_hold_minutes?: number
          p_hotel_id: string
          p_property_id: string
          p_rate_plan_id: string
          p_room_type_id: string
          p_rooms: number
        }
        Returns: Json
      }
      ensure_inventory: {
        Args: { p_room_type_id: string; p_until: string }
        Returns: undefined
      }
      gen_booking_code: { Args: never; Returns: string }
      grant_promotion: {
        Args: {
          p_hotel_id: string
          p_months: number
          p_note?: string
          p_package_id: string
        }
        Returns: Json
      }
      is_super_admin: { Args: never; Returns: boolean }
      log_audit: {
        Args: {
          p_action?: string
          p_entity_id?: string
          p_entity_type?: string
          p_hotel_id?: string
          p_new?: Json
          p_note?: string
          p_old?: Json
        }
        Returns: undefined
      }
      recalc_inventory_total: {
        Args: { p_room_type_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          p_amount_satang: number
          p_booking_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_slip_path?: string
        }
        Returns: string
      }
      redeem_promo_code: {
        Args: { p_code: string; p_hotel_id: string }
        Returns: Json
      }
      storage_hotel_id: { Args: { p_name: string }; Returns: string }
      user_can: {
        Args: { p_hotel_id: string; p_permission: string }
        Returns: boolean
      }
      user_role_in_hotel: {
        Args: { p_hotel_id: string }
        Returns: Database["public"]["Enums"]["hotel_role"]
      }
      verify_slip_payment: {
        Args: { p_approve: boolean; p_payment_id: string }
        Returns: undefined
      }
    }
    Enums: {
      billing_cycle: "monthly" | "yearly"
      booking_channel:
        | "front_desk"
        | "phone"
        | "walk_in"
        | "booking_engine"
        | "ota_agoda"
        | "ota_booking"
        | "ota_trip"
        | "ota_other"
      booking_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "checked_out"
        | "cancelled"
        | "no_show"
      folio_item_category:
        | "room"
        | "food"
        | "minibar"
        | "laundry"
        | "spa"
        | "service_charge"
        | "vat"
        | "other"
      guest_id_type: "national_id" | "passport"
      hotel_role:
        | "owner"
        | "admin"
        | "manager"
        | "front_desk"
        | "housekeeping"
        | "viewer"
      housekeeping_status: "clean" | "dirty" | "inspected" | "out_of_order"
      invoice_status: "pending" | "paid" | "failed" | "expired" | "void"
      payment_direction: "charge" | "refund"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "card_terminal"
        | "promptpay_qr"
        | "card_online"
        | "wechat_pay"
        | "alipay"
        | "ota_collect"
        | "other"
      payment_status: "pending" | "confirmed" | "failed" | "voided"
      room_block_reason: "maintenance" | "renovation" | "private"
      saas_payment_method: "card" | "qr_promptpay" | "manual"
      subscription_status:
        | "active"
        | "grace"
        | "expired"
        | "canceled"
        | "trialing"
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
      billing_cycle: ["monthly", "yearly"],
      booking_channel: [
        "front_desk",
        "phone",
        "walk_in",
        "booking_engine",
        "ota_agoda",
        "ota_booking",
        "ota_trip",
        "ota_other",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
      ],
      folio_item_category: [
        "room",
        "food",
        "minibar",
        "laundry",
        "spa",
        "service_charge",
        "vat",
        "other",
      ],
      guest_id_type: ["national_id", "passport"],
      hotel_role: [
        "owner",
        "admin",
        "manager",
        "front_desk",
        "housekeeping",
        "viewer",
      ],
      housekeeping_status: ["clean", "dirty", "inspected", "out_of_order"],
      invoice_status: ["pending", "paid", "failed", "expired", "void"],
      payment_direction: ["charge", "refund"],
      payment_method: [
        "cash",
        "bank_transfer",
        "card_terminal",
        "promptpay_qr",
        "card_online",
        "wechat_pay",
        "alipay",
        "ota_collect",
        "other",
      ],
      payment_status: ["pending", "confirmed", "failed", "voided"],
      room_block_reason: ["maintenance", "renovation", "private"],
      saas_payment_method: ["card", "qr_promptpay", "manual"],
      subscription_status: [
        "active",
        "grace",
        "expired",
        "canceled",
        "trialing",
      ],
    },
  },
} as const
