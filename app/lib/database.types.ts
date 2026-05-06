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
      admin_broadcasts: {
        Row: {
          body: string
          broadcast_type: string | null
          created_at: string | null
          fail_count: number | null
          id: number
          image_url: string | null
          link_url: string | null
          sent_count: number | null
          title: string
        }
        Insert: {
          body: string
          broadcast_type?: string | null
          created_at?: string | null
          fail_count?: number | null
          id?: number
          image_url?: string | null
          link_url?: string | null
          sent_count?: number | null
          title: string
        }
        Update: {
          body?: string
          broadcast_type?: string | null
          created_at?: string | null
          fail_count?: number | null
          id?: number
          image_url?: string | null
          link_url?: string | null
          sent_count?: number | null
          title?: string
        }
        Relationships: []
      }
      admin_emails: {
        Row: {
          created_at: string | null
          email: string
          id: number
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: number
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: number
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          emoji: string
          id: number
          is_popular: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: number
          is_popular?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: number
          is_popular?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: number
          created_at: string | null
          firebase_uid: string | null
          id: number
          ip_address: string
        }
        Insert: {
          comment_id: number
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address: string
        }
        Update: {
          comment_id?: number
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: number
          created_at: string | null
          deleted_at: string | null
          id: number
          reason: string
          resolved: boolean | null
          resolved_at: string | null
        }
        Insert: {
          comment_id: number
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          reason: string
          resolved?: boolean | null
          resolved_at?: string | null
        }
        Update: {
          comment_id?: number
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          reason?: string
          resolved?: boolean | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author: string
          content: string
          created_at: string | null
          firebase_uid: string | null
          hidden: boolean | null
          id: number
          ip_address: string | null
          likes: number | null
          parent_id: number | null
          password: string
          post_id: number
          updated_at: string | null
        }
        Insert: {
          author: string
          content: string
          created_at?: string | null
          firebase_uid?: string | null
          hidden?: boolean | null
          id?: number
          ip_address?: string | null
          likes?: number | null
          parent_id?: number | null
          password: string
          post_id: number
          updated_at?: string | null
        }
        Update: {
          author?: string
          content?: string
          created_at?: string | null
          firebase_uid?: string | null
          hidden?: boolean | null
          id?: number
          ip_address?: string | null
          likes?: number | null
          parent_id?: number | null
          password?: string
          post_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string | null
          firebase_uid: string
          id: number
          platform: string | null
          token: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          firebase_uid: string
          id?: number
          platform?: string | null
          token: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string
          id?: number
          platform?: string | null
          token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          author: string
          content: string
          created_at: string | null
          email: string | null
          firebase_uid: string | null
          hidden: boolean | null
          id: number
          password: string
          read_at: string | null
          replied_at: string | null
          reply: string | null
          title: string
        }
        Insert: {
          author: string
          content: string
          created_at?: string | null
          email?: string | null
          firebase_uid?: string | null
          hidden?: boolean | null
          id?: number
          password: string
          read_at?: string | null
          replied_at?: string | null
          reply?: string | null
          title?: string
        }
        Update: {
          author?: string
          content?: string
          created_at?: string | null
          email?: string | null
          firebase_uid?: string | null
          hidden?: boolean | null
          id?: number
          password?: string
          read_at?: string | null
          replied_at?: string | null
          reply?: string | null
          title?: string
        }
        Relationships: []
      }
      job_post_bookmarks: {
        Row: {
          created_at: string | null
          firebase_uid: string | null
          id: number
          ip_address: string
          job_post_id: number
        }
        Insert: {
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address: string
          job_post_id: number
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address?: string
          job_post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_post_bookmarks_job_post_id_fkey"
            columns: ["job_post_id"]
            isOneToOne: false
            referencedRelation: "job_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      job_post_likes: {
        Row: {
          created_at: string | null
          firebase_uid: string | null
          id: number
          ip_address: string
          job_post_id: number
        }
        Insert: {
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address: string
          job_post_id: number
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address?: string
          job_post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_post_likes_job_post_id_fkey"
            columns: ["job_post_id"]
            isOneToOne: false
            referencedRelation: "job_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      job_posts: {
        Row: {
          address: string | null
          author_name: string | null
          author_role: string | null
          benefits: string | null
          center_name: string
          contact: string
          contact_type: string | null
          created_at: string | null
          deadline: string | null
          description: string
          employment_type: string
          firebase_uid: string | null
          headcount: string | null
          hidden: boolean | null
          id: number
          ip_address: string | null
          is_closed: boolean | null
          likes: number | null
          preferences: string | null
          region_code: string
          region_name: string
          salary: string
          share_count: number | null
          source: string | null
          source_id: string | null
          sport: string
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          address?: string | null
          author_name?: string | null
          author_role?: string | null
          benefits?: string | null
          center_name: string
          contact: string
          contact_type?: string | null
          created_at?: string | null
          deadline?: string | null
          description: string
          employment_type: string
          firebase_uid?: string | null
          headcount?: string | null
          hidden?: boolean | null
          id?: number
          ip_address?: string | null
          is_closed?: boolean | null
          likes?: number | null
          preferences?: string | null
          region_code: string
          region_name: string
          salary: string
          share_count?: number | null
          source?: string | null
          source_id?: string | null
          sport: string
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          address?: string | null
          author_name?: string | null
          author_role?: string | null
          benefits?: string | null
          center_name?: string
          contact?: string
          contact_type?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string
          employment_type?: string
          firebase_uid?: string | null
          headcount?: string | null
          hidden?: boolean | null
          id?: number
          ip_address?: string | null
          is_closed?: boolean | null
          likes?: number | null
          preferences?: string | null
          region_code?: string
          region_name?: string
          salary?: string
          share_count?: number | null
          source?: string | null
          source_id?: string | null
          sport?: string
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          deleted_by_receiver: boolean
          deleted_by_receiver_at: string | null
          deleted_by_sender: boolean
          deleted_by_sender_at: string | null
          archived_by_receiver: boolean
          archived_by_receiver_at: string | null
          archived_by_sender: boolean
          archived_by_sender_at: string | null
          spam_reported_by_receiver: boolean
          spam_reported_at: string | null
          id: number
          is_read: boolean | null
          parent_id: number | null
          receiver_nickname: string
          receiver_uid: string
          sender_nickname: string
          sender_uid: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_by_receiver?: boolean
          deleted_by_receiver_at?: string | null
          deleted_by_sender?: boolean
          deleted_by_sender_at?: string | null
          archived_by_receiver?: boolean
          archived_by_receiver_at?: string | null
          archived_by_sender?: boolean
          archived_by_sender_at?: string | null
          spam_reported_by_receiver?: boolean
          spam_reported_at?: string | null
          id?: number
          is_read?: boolean | null
          parent_id?: number | null
          receiver_nickname: string
          receiver_uid: string
          sender_nickname: string
          sender_uid: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_by_receiver?: boolean
          deleted_by_receiver_at?: string | null
          deleted_by_sender?: boolean
          deleted_by_sender_at?: string | null
          archived_by_receiver?: boolean
          archived_by_receiver_at?: string | null
          archived_by_sender?: boolean
          archived_by_sender_at?: string | null
          spam_reported_by_receiver?: boolean
          spam_reported_at?: string | null
          id?: number
          is_read?: boolean | null
          parent_id?: number | null
          receiver_nickname?: string
          receiver_uid?: string
          sender_nickname?: string
          sender_uid?: string
        }
        Relationships: []
      }
      nicknames: {
        Row: {
          changed_at: string | null
          created_at: string | null
          firebase_uid: string | null
          id: number
          name: string
        }
        Insert: {
          changed_at?: string | null
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          name: string
        }
        Update: {
          changed_at?: string | null
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          body: string | null
          created_at: string | null
          data: string | null
          firebase_uid: string | null
          id: number
          like_count: number | null
          read: boolean | null
          title: string | null
          type: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: string | null
          firebase_uid?: string | null
          id?: number
          like_count?: number | null
          read?: boolean | null
          title?: string | null
          type?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: string | null
          firebase_uid?: string | null
          id?: number
          like_count?: number | null
          read?: boolean | null
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          firebase_uid: string
          id: number
          notify_comment: boolean | null
          notify_job: boolean | null
          notify_keyword: boolean | null
          notify_like: boolean | null
          notify_message: boolean | null
          notify_notice: boolean | null
          notify_promo: boolean | null
          notify_reply: boolean | null
        }
        Insert: {
          created_at?: string | null
          firebase_uid: string
          id?: number
          notify_comment?: boolean | null
          notify_job?: boolean | null
          notify_keyword?: boolean | null
          notify_like?: boolean | null
          notify_message?: boolean | null
          notify_notice?: boolean | null
          notify_promo?: boolean | null
          notify_reply?: boolean | null
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string
          id?: number
          notify_comment?: boolean | null
          notify_job?: boolean | null
          notify_keyword?: boolean | null
          notify_like?: boolean | null
          notify_message?: boolean | null
          notify_notice?: boolean | null
          notify_promo?: boolean | null
          notify_reply?: boolean | null
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          id: number
          blocker_uid: string
          blocked_uid: string
          blocked_nickname: string
          created_at: string
        }
        Insert: {
          id?: number
          blocker_uid: string
          blocked_uid: string
          blocked_nickname: string
          created_at?: string
        }
        Update: {
          id?: number
          blocker_uid?: string
          blocked_uid?: string
          blocked_nickname?: string
          created_at?: string
        }
        Relationships: []
      }
      post_bookmarks: {
        Row: {
          created_at: string | null
          firebase_uid: string
          id: number
          post_id: number
        }
        Insert: {
          created_at?: string | null
          firebase_uid: string
          id?: number
          post_id: number
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string
          id?: number
          post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          firebase_uid: string | null
          id: number
          ip_address: string
          post_id: number
        }
        Insert: {
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address: string
          post_id: number
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string | null
          id?: number
          ip_address?: string
          post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: number
          post_id: number
          reason: string
          resolved: boolean | null
          resolved_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          post_id: number
          reason: string
          resolved?: boolean | null
          resolved_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          post_id?: number
          reason?: string
          resolved?: boolean | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author: string
          category_id: number | null
          comments_count: number | null
          content: string
          created_at: string | null
          firebase_uid: string | null
          hidden: boolean | null
          id: number
          images: string | null
          ip_address: string | null
          is_notice: boolean | null
          likes: number | null
          password: string
          region: string
          share_count: number | null
          tags: string
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          author?: string
          category_id?: number | null
          comments_count?: number | null
          content: string
          created_at?: string | null
          firebase_uid?: string | null
          hidden?: boolean | null
          id?: number
          images?: string | null
          ip_address?: string | null
          is_notice?: boolean | null
          likes?: number | null
          password?: string
          region?: string
          share_count?: number | null
          tags?: string
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          author?: string
          category_id?: number | null
          comments_count?: number | null
          content?: string
          created_at?: string | null
          firebase_uid?: string | null
          hidden?: boolean | null
          id?: number
          images?: string | null
          ip_address?: string | null
          is_notice?: boolean | null
          likes?: number | null
          password?: string
          region?: string
          share_count?: number | null
          tags?: string
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category_id: number | null
          created_at: string | null
          custom_reason: string | null
          deleted_at: string | null
          id: number
          post_id: number | null
          reason: string
          resolved: boolean | null
          resolved_at: string | null
          target_hidden: boolean | null
          target_id: number
          target_type: string
        }
        Insert: {
          category_id?: number | null
          created_at?: string | null
          custom_reason?: string | null
          deleted_at?: string | null
          id?: number
          post_id?: number | null
          reason: string
          resolved?: boolean | null
          resolved_at?: string | null
          target_hidden?: boolean | null
          target_id: number
          target_type: string
        }
        Update: {
          category_id?: number | null
          created_at?: string | null
          custom_reason?: string | null
          deleted_at?: string | null
          id?: number
          post_id?: number | null
          reason?: string
          resolved?: boolean | null
          resolved_at?: string | null
          target_hidden?: boolean | null
          target_id?: number
          target_type?: string
        }
        Relationships: []
      }
      store_clicks: {
        Row: {
          clicked_at: string | null
          id: number
          store: string
        }
        Insert: {
          clicked_at?: string | null
          id?: number
          store: string
        }
        Update: {
          clicked_at?: string | null
          id?: number
          store?: string
        }
        Relationships: []
      }
      user_first_seen: {
        Row: {
          firebase_uid: string
          seen_at: string | null
        }
        Insert: {
          firebase_uid: string
          seen_at?: string | null
        }
        Update: {
          firebase_uid?: string
          seen_at?: string | null
        }
        Relationships: []
      }
      user_keywords: {
        Row: {
          created_at: string | null
          firebase_uid: string
          id: number
          keyword: string
        }
        Insert: {
          created_at?: string | null
          firebase_uid: string
          id?: number
          keyword: string
        }
        Update: {
          created_at?: string | null
          firebase_uid?: string
          id?: number
          keyword?: string
        }
        Relationships: []
      }
      web_notification_reads: {
        Row: {
          firebase_uid: string
          id: number
          notification_id: number
          read_at: string | null
        }
        Insert: {
          firebase_uid: string
          id?: number
          notification_id: number
          read_at?: string | null
        }
        Update: {
          firebase_uid?: string
          id?: number
          notification_id?: number
          read_at?: string | null
        }
        Relationships: []
      }
      practical_oral_notices: {
        Row: {
          id: number
          audience: string
          slug: string
          icon: string | null
          badge: string | null
          title: string
          summary: string | null
          content: string
          display_order: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          audience?: string
          slug: string
          icon?: string | null
          badge?: string | null
          title: string
          summary?: string | null
          content?: string
          display_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          audience?: string
          slug?: string
          icon?: string | null
          badge?: string | null
          title?: string
          summary?: string | null
          content?: string
          display_order?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sport_organizations: {
        Row: {
          id: number
          audience: string
          sport_name: string
          org_name: string
          phone: string | null
          zipcode: string | null
          address: string | null
          website: string | null
          display_order: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          audience?: string
          sport_name: string
          org_name: string
          phone?: string | null
          zipcode?: string | null
          address?: string | null
          website?: string | null
          display_order?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          audience?: string
          sport_name?: string
          org_name?: string
          phone?: string | null
          zipcode?: string | null
          address?: string | null
          website?: string | null
          display_order?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trade_post_bookmarks: {
        Row: {
          id: number
          trade_post_id: number
          firebase_uid: string
          created_at: string
        }
        Insert: {
          id?: number
          trade_post_id: number
          firebase_uid: string
          created_at?: string
        }
        Update: {
          id?: number
          trade_post_id?: number
          firebase_uid?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_post_bookmarks_trade_post_id_fkey"
            columns: ["trade_post_id"]
            isOneToOne: false
            referencedRelation: "trade_posts"
            referencedColumns: ["id"]
          }
        ]
      }
      trade_posts: {
        Row: {
          id: number
          firebase_uid: string
          category: string
          title: string
          body: string | null
          region_sido: string
          region_sigungu: string
          region_detail: string | null
          contact_phone: string
          image_urls: string[]
          product_name: string | null
          condition_text: string | null
          price_manwon: number | null
          center_name: string | null
          equipment_info: Json | null
          center_info: Json | null
          view_count: number
          share_count: number
          bookmark_count: number
          status: string
          agreed_to_terms: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          firebase_uid: string
          category: string
          title: string
          body?: string | null
          region_sido: string
          region_sigungu: string
          region_detail?: string | null
          contact_phone: string
          image_urls?: string[]
          product_name?: string | null
          condition_text?: string | null
          price_manwon?: number | null
          center_name?: string | null
          equipment_info?: Json | null
          center_info?: Json | null
          view_count?: number
          share_count?: number
          bookmark_count?: number
          status?: string
          agreed_to_terms?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          firebase_uid?: string
          category?: string
          title?: string
          body?: string | null
          region_sido?: string
          region_sigungu?: string
          region_detail?: string | null
          contact_phone?: string
          image_urls?: string[]
          product_name?: string | null
          condition_text?: string | null
          price_manwon?: number | null
          center_name?: string | null
          equipment_info?: Json | null
          center_info?: Json | null
          view_count?: number
          share_count?: number
          bookmark_count?: number
          status?: string
          agreed_to_terms?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_comments_counter: {
        Args: { p_col: string; p_delta: number; p_id: number }
        Returns: undefined
      }
      adjust_job_post_counter: {
        Args: { p_col: string; p_delta: number; p_id: number }
        Returns: undefined
      }
      adjust_post_counter: {
        Args: { p_col: string; p_delta: number; p_id: number }
        Returns: undefined
      }
      admin_kpi_metrics: { Args: never; Returns: Json }
      admin_reports_with_targets: {
        Args: never
        Returns: {
          category_id: number
          category_name: string
          comment_author: string
          comment_content: string
          created_at: string
          custom_reason: string
          deleted_at: string
          id: number
          job_post_author: string
          job_post_title: string
          post_author: string
          post_id: number
          post_title: string
          reason: string
          resolved: boolean
          resolved_at: string
          target_hidden: boolean
          target_id: number
          target_type: string
        }[]
      }
      auto_close_expired_jobs: { Args: never; Returns: number }
      count_job_posts: {
        Args: {
          p_employment_type?: string
          p_hide_closed?: boolean
          p_parent_code?: string
          p_region_code?: string
          p_search_pattern?: string
          p_search_type?: string
          p_sport_filter?: string
          p_sub_name_pattern?: string
        }
        Returns: number
      }
      increment_post_share: { Args: { p_id: number }; Returns: undefined }
      increment_post_views: { Args: { p_id: number }; Returns: undefined }
      job_posts_region_counts: {
        Args: never
        Returns: {
          cnt: number
          region_code: string
        }[]
      }
      job_posts_subregion_counts: {
        Args: never
        Returns: {
          cnt: number
          parent: string
          sub_name: string
        }[]
      }
      job_posts_today_regions: {
        Args: never
        Returns: {
          region_code: string
        }[]
      }
      search_job_posts: {
        Args: {
          p_employment_type?: string
          p_hide_closed?: boolean
          p_limit?: number
          p_offset?: number
          p_order_col?: string
          p_parent_code?: string
          p_region_code?: string
          p_search_pattern?: string
          p_search_type?: string
          p_sport_filter?: string
          p_sub_name_pattern?: string
        }
        Returns: {
          like: Database["public"]["Tables"]["job_posts"]["Row"]
        }[]
        SetofOptions: {
          from: "*"
          to: "job_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_jobs_by_regex: {
        Args: { p_limit?: number; p_pattern: string }
        Returns: {
          address: string | null
          author_name: string | null
          author_role: string | null
          benefits: string | null
          center_name: string
          contact: string
          contact_type: string | null
          created_at: string | null
          deadline: string | null
          description: string
          employment_type: string
          firebase_uid: string | null
          headcount: string | null
          hidden: boolean | null
          id: number
          ip_address: string | null
          is_closed: boolean | null
          likes: number | null
          preferences: string | null
          region_code: string
          region_name: string
          salary: string
          share_count: number | null
          source: string | null
          source_id: string | null
          sport: string
          title: string
          updated_at: string | null
          views: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "job_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_posts_by_regex: {
        Args: { p_limit?: number; p_pattern: string }
        Returns: {
          author: string
          category_id: number
          category_name: string
          comments_count: number
          content: string
          created_at: string
          firebase_uid: string
          hidden: boolean
          id: number
          images: string
          ip_address: string
          is_notice: boolean
          likes: number
          password: string
          region: string
          share_count: number
          tags: string
          title: string
          updated_at: string
          views: number
        }[]
      }
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
