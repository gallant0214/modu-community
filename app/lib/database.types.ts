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
          price_won: number | null
          center_name: string | null
          equipment_info: Json | null
          center_info: Json | null
          gear_info: Json | null
          view_count: number
          share_count: number
          bookmark_count: number
          status: string
          agreed_to_terms: boolean
          created_at: string
          updated_at: string
          bumped_at: string | null
          effective_at: string | null
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
          price_won?: number | null
          center_name?: string | null
          equipment_info?: Json | null
          center_info?: Json | null
          gear_info?: Json | null
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
          price_won?: number | null
          center_name?: string | null
          equipment_info?: Json | null
          center_info?: Json | null
          gear_info?: Json | null
          view_count?: number
          share_count?: number
          bookmark_count?: number
          status?: string
          agreed_to_terms?: boolean
          created_at?: string
          updated_at?: string
          bumped_at?: string | null
          effective_at?: string | null
        }
        Relationships: []
      }
      crm_center_notices: {
        Row: {
          id: number
          center_id: number
          title: string
          body: string
          is_published: boolean
          status: string
          created_by_uid: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          title: string
          body?: string
          is_published?: boolean
          status?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          title?: string
          body?: string
          is_published?: boolean
          status?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_vendors: {
        Row: {
          id: number
          center_id: number
          name: string
          phone: string | null
          category: string | null
          memo: string | null
          sort_order: number
          status: string
          created_by_uid: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          name: string
          phone?: string | null
          category?: string | null
          memo?: string | null
          sort_order?: number
          status?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          name?: string
          phone?: string | null
          category?: string | null
          memo?: string | null
          sort_order?: number
          status?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_center_join_links: {
        Row: {
          id: number
          center_id: number
          token: string
          code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          token: string
          code: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          token?: string
          code?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_centers: {
        Row: {
          id: number
          owner_uid: string
          name: string
          kind: string
          region_sido: string | null
          region_sigungu: string | null
          phone: string | null
          business_no: string | null
          status: string
          address: string | null
          naver_url: string | null
          google_url: string | null
          instagram_id: string | null
          youtube_url: string | null
          operating_hours: string | null
          kiosk_token: string | null
          logo_data_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          owner_uid: string
          name: string
          kind: string
          region_sido?: string | null
          region_sigungu?: string | null
          phone?: string | null
          business_no?: string | null
          status?: string
          address?: string | null
          naver_url?: string | null
          google_url?: string | null
          instagram_id?: string | null
          youtube_url?: string | null
          operating_hours?: string | null
          kiosk_token?: string | null
          logo_data_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          owner_uid?: string
          name?: string
          kind?: string
          region_sido?: string | null
          region_sigungu?: string | null
          phone?: string | null
          business_no?: string | null
          status?: string
          address?: string | null
          naver_url?: string | null
          google_url?: string | null
          instagram_id?: string | null
          youtube_url?: string | null
          operating_hours?: string | null
          kiosk_token?: string | null
          logo_data_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_center_members: {
        Row: {
          id: number
          center_id: number
          firebase_uid: string
          role: string
          display_name: string
          phone: string | null
          email: string | null
          address: string | null
          employment_status: string
          employment_type: string | null
          access_level: string
          is_solo_owner: boolean
          status: string
          joined_at: string
          left_at: string | null
          grade_id: number | null
          commission_type: string
          commission_rate: number
          commission_tiers: unknown
          base_salary: number
          cash_pay_enabled: boolean
          cash_pay_won: number
          commission_bonuses: Json
          birth: string | null
          resident_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          firebase_uid: string
          role: string
          display_name: string
          phone?: string | null
          email?: string | null
          address?: string | null
          employment_status?: string
          employment_type?: string | null
          access_level?: string
          is_solo_owner?: boolean
          status?: string
          joined_at?: string
          left_at?: string | null
          grade_id?: number | null
          commission_type?: string
          commission_rate?: number
          commission_tiers?: unknown
          base_salary?: number
          cash_pay_enabled?: boolean
          cash_pay_won?: number
          commission_bonuses?: Json
          birth?: string | null
          resident_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          firebase_uid?: string
          role?: string
          display_name?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          employment_status?: string
          employment_type?: string | null
          access_level?: string
          is_solo_owner?: boolean
          status?: string
          joined_at?: string
          left_at?: string | null
          grade_id?: number | null
          commission_type?: string
          commission_rate?: number
          commission_tiers?: unknown
          base_salary?: number
          cash_pay_enabled?: boolean
          cash_pay_won?: number
          commission_bonuses?: Json
          birth?: string | null
          resident_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_center_members_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "crm_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_attendances: {
        Row: {
          id: number
          center_id: number
          member_id: number
          checked_in_at: string
          source: string
          note: string | null
          attendance_mileage_awarded: number
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          checked_in_at?: string
          source?: string
          note?: string | null
          attendance_mileage_awarded?: number
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          checked_in_at?: string
          source?: string
          note?: string | null
          attendance_mileage_awarded?: number
        }
        Relationships: []
      }
      crm_body_measurements: {
        Row: {
          id: number
          center_id: number
          member_id: number
          measured_at: string
          height_cm: number | null
          weight_kg: number | null
          muscle_kg: number | null
          body_fat_kg: number | null
          body_fat_pct: number | null
          bmi: number | null
          visceral_fat: number | null
          basal_metabolism: number | null
          memo: string | null
          recorded_by_uid: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          measured_at: string
          height_cm?: number | null
          weight_kg?: number | null
          muscle_kg?: number | null
          body_fat_kg?: number | null
          body_fat_pct?: number | null
          bmi?: number | null
          visceral_fat?: number | null
          basal_metabolism?: number | null
          memo?: string | null
          recorded_by_uid: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          measured_at?: string
          height_cm?: number | null
          weight_kg?: number | null
          muscle_kg?: number | null
          body_fat_kg?: number | null
          body_fat_pct?: number | null
          bmi?: number | null
          visceral_fat?: number | null
          basal_metabolism?: number | null
          memo?: string | null
          recorded_by_uid?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_product_types: {
        Row: {
          id: number
          center_id: number
          key: string
          label: string
          color: string | null
          sort_order: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          key: string
          label: string
          color?: string | null
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          key?: string
          label?: string
          color?: string | null
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_products: {
        Row: {
          id: number
          center_id: number
          trainer_member_id: number | null
          type: string
          billing_mode: string
          category: string | null
          name: string
          description: string | null
          open_time: string | null
          close_time: string | null
          operating_days: number[]
          duration_value: number | null
          duration_unit: string | null
          service_days: number
          total_sessions: number | null
          pause_enabled: boolean
          pause_days: number
          price_won: number
          mileage_earn: number
          mileage_usable: boolean
          attendance_mileage_earn: number
          pause_count: number
          vat_included: boolean
          capacity: number
          class_cancel_before_min: number
          class_book_before_min: number
          session_minutes: number
          daily_check_in_limit: number
          daily_time_limit_enabled: boolean
          components: Json
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          trainer_member_id?: number | null
          type: string
          billing_mode?: string
          category?: string | null
          name: string
          description?: string | null
          open_time?: string | null
          close_time?: string | null
          operating_days?: number[]
          duration_value?: number | null
          duration_unit?: string | null
          service_days?: number
          total_sessions?: number | null
          pause_enabled?: boolean
          pause_days?: number
          price_won?: number
          mileage_earn?: number
          mileage_usable?: boolean
          attendance_mileage_earn?: number
          pause_count?: number
          vat_included?: boolean
          capacity?: number
          class_cancel_before_min?: number
          class_book_before_min?: number
          session_minutes?: number
          daily_check_in_limit?: number
          daily_time_limit_enabled?: boolean
          components?: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          trainer_member_id?: number | null
          type?: string
          billing_mode?: string
          category?: string | null
          name?: string
          description?: string | null
          open_time?: string | null
          close_time?: string | null
          operating_days?: number[]
          duration_value?: number | null
          duration_unit?: string | null
          service_days?: number
          total_sessions?: number | null
          pause_enabled?: boolean
          pause_days?: number
          price_won?: number
          mileage_earn?: number
          mileage_usable?: boolean
          attendance_mileage_earn?: number
          pause_count?: number
          vat_included?: boolean
          capacity?: number
          class_cancel_before_min?: number
          class_book_before_min?: number
          session_minutes?: number
          daily_check_in_limit?: number
          daily_time_limit_enabled?: boolean
          components?: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_memberships: {
        Row: {
          id: number
          center_id: number
          member_id: number
          seller_member_id: number | null
          plan_name: string
          duration_days: number
          price_won: number
          discount_won: number
          mileage_earned: number
          mileage_used: number
          attendance_mileage_earn: number
          vat_included: boolean
          payment_method: string
          payment_method_custom: string | null
          start_date: string
          expires_at: string
          purchased_at: string | null
          status: string
          memo: string | null
          outstanding_won: number
          payment_status: string
          is_paused: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          seller_member_id?: number | null
          plan_name: string
          duration_days: number
          price_won?: number
          discount_won?: number
          mileage_earned?: number
          mileage_used?: number
          attendance_mileage_earn?: number
          vat_included?: boolean
          payment_method?: string
          payment_method_custom?: string | null
          start_date: string
          expires_at: string
          purchased_at?: string | null
          status?: string
          memo?: string | null
          outstanding_won?: number
          payment_status?: string
          is_paused?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          seller_member_id?: number | null
          plan_name?: string
          duration_days?: number
          price_won?: number
          discount_won?: number
          mileage_earned?: number
          mileage_used?: number
          attendance_mileage_earn?: number
          vat_included?: boolean
          payment_method?: string
          payment_method_custom?: string | null
          start_date?: string
          expires_at?: string
          purchased_at?: string | null
          status?: string
          memo?: string | null
          outstanding_won?: number
          payment_status?: string
          is_paused?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_payments: {
        Row: {
          id: number
          center_id: number
          member_id: number
          pass_id: number | null
          membership_id: number | null
          rental_id: number | null
          amount_won: number
          method: string
          method_custom: string | null
          paid_at: string
          recorded_by_uid: string | null
          note: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          pass_id?: number | null
          membership_id?: number | null
          rental_id?: number | null
          amount_won: number
          method?: string
          method_custom?: string | null
          paid_at?: string
          recorded_by_uid?: string | null
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          pass_id?: number | null
          membership_id?: number | null
          rental_id?: number | null
          amount_won?: number
          method?: string
          method_custom?: string | null
          paid_at?: string
          recorded_by_uid?: string | null
          note?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_sales: {
        Row: {
          id: number
          center_id: number
          tx_at: string
          tx_type: string
          product_type: string | null
          product_name: string | null
          category: string | null
          member_id: number | null
          customer_name: string | null
          customer_phone: string | null
          registration_type: string | null
          amount_won: number
          cash_won: number
          card_won: number
          culture_won: number
          payment_channel: string | null
          seller_name: string | null
          income_deduction: string | null
          approval_no: string | null
          product_memo: string | null
          order_memo: string | null
          source: string
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          tx_at: string
          tx_type: string
          product_type?: string | null
          product_name?: string | null
          category?: string | null
          member_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          registration_type?: string | null
          amount_won?: number
          cash_won?: number
          card_won?: number
          culture_won?: number
          payment_channel?: string | null
          seller_name?: string | null
          income_deduction?: string | null
          approval_no?: string | null
          product_memo?: string | null
          order_memo?: string | null
          source?: string
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          tx_at?: string
          tx_type?: string
          product_type?: string | null
          product_name?: string | null
          category?: string | null
          member_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          registration_type?: string | null
          amount_won?: number
          cash_won?: number
          card_won?: number
          culture_won?: number
          payment_channel?: string | null
          seller_name?: string | null
          income_deduction?: string | null
          approval_no?: string | null
          product_memo?: string | null
          order_memo?: string | null
          source?: string
          created_at?: string
        }
        Relationships: []
      }
      crm_rentals: {
        Row: {
          id: number
          center_id: number
          member_id: number
          seller_member_id: number | null
          item_name: string
          price_won: number
          discount_won: number
          mileage_earned: number
          mileage_used: number
          vat_included: boolean
          payment_method: string
          payment_method_custom: string | null
          start_date: string
          expires_at: string
          status: string
          is_paused: boolean
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          seller_member_id?: number | null
          item_name: string
          price_won?: number
          discount_won?: number
          mileage_earned?: number
          mileage_used?: number
          vat_included?: boolean
          payment_method?: string
          payment_method_custom?: string | null
          start_date: string
          expires_at: string
          status?: string
          is_paused?: boolean
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          seller_member_id?: number | null
          item_name?: string
          price_won?: number
          discount_won?: number
          mileage_earned?: number
          mileage_used?: number
          vat_included?: boolean
          payment_method?: string
          payment_method_custom?: string | null
          start_date?: string
          expires_at?: string
          status?: string
          is_paused?: boolean
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_pauses: {
        Row: {
          id: number
          center_id: number
          member_id: number
          pass_id: number | null
          membership_id: number | null
          rental_id: number | null
          start_date: string
          end_date: string
          reason: string | null
          requested_by: string | null
          status: string
          extended_days: number
          created_at: string
          created_by_uid: string | null
          cancelled_at: string | null
          cancelled_by_uid: string | null
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          pass_id?: number | null
          membership_id?: number | null
          rental_id?: number | null
          start_date: string
          end_date: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          extended_days?: number
          created_at?: string
          created_by_uid?: string | null
          cancelled_at?: string | null
          cancelled_by_uid?: string | null
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          pass_id?: number | null
          membership_id?: number | null
          rental_id?: number | null
          start_date?: string
          end_date?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          extended_days?: number
          created_at?: string
          created_by_uid?: string | null
          cancelled_at?: string | null
          cancelled_by_uid?: string | null
        }
        Relationships: []
      }
      crm_signed_contracts: {
        Row: {
          id: number
          center_id: number
          member_id: number | null
          staff_member_id: number | null
          pass_id: number | null
          membership_id: number | null
          title: string
          customer_info: unknown
          product_info: unknown
          payment_info: unknown
          terms_accepted: unknown
          terms_snapshot: unknown
          signature_data_url: string | null
          trainer_signature_data_url: string | null
          signed_at: string
          signed_by_uid: string | null
          status: string
          signing_token: string | null
          requested_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id?: number | null
          staff_member_id?: number | null
          pass_id?: number | null
          membership_id?: number | null
          title?: string
          customer_info?: unknown
          product_info?: unknown
          payment_info?: unknown
          terms_accepted?: unknown
          terms_snapshot?: unknown
          signature_data_url?: string | null
          trainer_signature_data_url?: string | null
          signed_at?: string
          signed_by_uid?: string | null
          status?: string
          signing_token?: string | null
          requested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number | null
          staff_member_id?: number | null
          pass_id?: number | null
          membership_id?: number | null
          title?: string
          customer_info?: unknown
          product_info?: unknown
          payment_info?: unknown
          terms_accepted?: unknown
          terms_snapshot?: unknown
          signature_data_url?: string | null
          trainer_signature_data_url?: string | null
          signed_at?: string
          signed_by_uid?: string | null
          status?: string
          signing_token?: string | null
          requested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_lockers: {
        Row: {
          id: number
          center_id: number
          zone_id: number
          number: number
          state: string
          assigned_member_id: number | null
          start_date: string | null
          expires_at: string | null
          password: string | null
          memo: string | null
          layout_row: number | null
          layout_col: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          zone_id: number
          number: number
          state?: string
          assigned_member_id?: number | null
          start_date?: string | null
          expires_at?: string | null
          password?: string | null
          memo?: string | null
          layout_row?: number | null
          layout_col?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          zone_id?: number
          number?: number
          state?: string
          assigned_member_id?: number | null
          start_date?: string | null
          expires_at?: string | null
          password?: string | null
          memo?: string | null
          layout_row?: number | null
          layout_col?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_locker_history: {
        Row: {
          id: number
          center_id: number
          locker_id: number | null
          zone_id: number
          number: number
          action: string
          member_id: number | null
          member_name: string | null
          start_date: string | null
          expires_at: string | null
          note: string | null
          changes: unknown
          actor_uid: string
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          locker_id?: number | null
          zone_id: number
          number: number
          action: string
          member_id?: number | null
          member_name?: string | null
          start_date?: string | null
          expires_at?: string | null
          note?: string | null
          changes?: unknown
          actor_uid: string
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          locker_id?: number | null
          zone_id?: number
          number?: number
          action?: string
          member_id?: number | null
          member_name?: string | null
          start_date?: string | null
          expires_at?: string | null
          note?: string | null
          changes?: unknown
          actor_uid?: string
          created_at?: string
        }
        Relationships: []
      }
      crm_locker_zones: {
        Row: {
          id: number
          center_id: number
          zone_number: number
          name: string
          locker_count: number
          start_number: number
          layout_rows: number
          layout_cols: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          zone_number: number
          name: string
          locker_count?: number
          start_number?: number
          layout_rows?: number
          layout_cols?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          zone_number?: number
          name?: string
          locker_count?: number
          start_number?: number
          layout_rows?: number
          layout_cols?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_role_permissions: {
        Row: {
          id: number
          center_id: number
          role_key: string
          permission_key: string
          enabled: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          role_key: string
          permission_key: string
          enabled?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          role_key?: string
          permission_key?: string
          enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crm_additional_expenses: {
        Row: {
          id: number
          center_id: number
          ym: string
          label: string
          amount_won: number
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          ym: string
          label: string
          amount_won?: number
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          ym?: string
          label?: string
          amount_won?: number
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_additional_incomes: {
        Row: {
          id: number
          center_id: number
          ym: string
          label: string
          amount_won: number
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          ym: string
          label: string
          amount_won?: number
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          ym?: string
          label?: string
          amount_won?: number
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_fixed_expenses: {
        Row: {
          id: number
          center_id: number
          label: string
          amount_won: number
          billing_day: number | null
          memo: string | null
          sort_order: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          label: string
          amount_won?: number
          billing_day?: number | null
          memo?: string | null
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          label?: string
          amount_won?: number
          billing_day?: number | null
          memo?: string | null
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_grade_permissions: {
        Row: {
          id: number
          center_id: number
          grade_id: number
          permission_key: string
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          grade_id: number
          permission_key: string
          enabled: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          grade_id?: number
          permission_key?: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_message_broadcasts: {
        Row: {
          id: number
          center_id: number
          title: string
          body: string
          audience_kind: string
          audience_filter: Json | null
          recipient_count: number
          sent_by_uid: string
          sent_by_name: string | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          title: string
          body: string
          audience_kind: string
          audience_filter?: Json | null
          recipient_count?: number
          sent_by_uid: string
          sent_by_name?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          title?: string
          body?: string
          audience_kind?: string
          audience_filter?: Json | null
          recipient_count?: number
          sent_by_uid?: string
          sent_by_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_message_recipients: {
        Row: {
          id: number
          broadcast_id: number
          center_id: number
          member_id: number
          status: string
          read_at: string | null
          delivered_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          broadcast_id: number
          center_id: number
          member_id: number
          status?: string
          read_at?: string | null
          delivered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          broadcast_id?: number
          center_id?: number
          member_id?: number
          status?: string
          read_at?: string | null
          delivered_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_schedule_events: {
        Row: {
          id: number
          center_id: number
          type: string
          title: string
          description: string | null
          trainer_member_id: number | null
          starts_at: string
          ends_at: string
          status: string
          created_by_uid: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          type: string
          title: string
          description?: string | null
          trainer_member_id?: number | null
          starts_at: string
          ends_at: string
          status?: string
          created_by_uid: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          type?: string
          title?: string
          description?: string | null
          trainer_member_id?: number | null
          starts_at?: string
          ends_at?: string
          status?: string
          created_by_uid?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_lesson_kinds: {
        Row: {
          id: number
          center_id: number
          label: string
          sort_order: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          label: string
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          label?: string
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_contract_categories: {
        Row: {
          id: number
          center_id: number
          key: string
          label: string
          sort_order: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          key: string
          label: string
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          key?: string
          label?: string
          sort_order?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_contract_templates: {
        Row: {
          id: number
          center_id: number
          category: string
          title: string
          body: string
          sections: unknown
          created_by_uid: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          category: string
          title: string
          body?: string
          sections?: unknown
          created_by_uid: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          category?: string
          title?: string
          body?: string
          sections?: unknown
          created_by_uid?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_grades: {
        Row: {
          id: number
          center_id: number
          base_role: string
          label: string
          is_system: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          base_role: string
          label: string
          is_system?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          base_role?: string
          label?: string
          is_system?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_grades_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "crm_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_trainer_permissions: {
        Row: {
          center_member_id: number
          can_create_reservation: boolean
          can_modify_reservation: boolean
          can_cancel_reservation: boolean
          attendance_mode: string
          can_cancel_attendance: boolean
          can_issue_pass: boolean
          can_manage_all_schedules: boolean
          updated_at: string
        }
        Insert: {
          center_member_id: number
          can_create_reservation?: boolean
          can_modify_reservation?: boolean
          can_cancel_reservation?: boolean
          attendance_mode?: string
          can_cancel_attendance?: boolean
          can_issue_pass?: boolean
          can_manage_all_schedules?: boolean
          updated_at?: string
        }
        Update: {
          center_member_id?: number
          can_create_reservation?: boolean
          can_modify_reservation?: boolean
          can_cancel_reservation?: boolean
          attendance_mode?: string
          can_cancel_attendance?: boolean
          can_issue_pass?: boolean
          can_manage_all_schedules?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crm_members: {
        Row: {
          id: number
          center_id: number
          member_type: string
          name: string
          phone: string | null
          email: string | null
          birth: string | null
          gender: string | null
          linked_firebase_uid: string | null
          memo: string | null
          status: string
          checkin_token: string | null
          address: string | null
          visit_route: string | null
          workout_goal: string | null
          counselor: string | null
          mileage: number
          marketing_consent: boolean
          registered_at: string | null
          registration_type: string | null
          first_use_at: string | null
          total_paid_won: number
          final_expire_at: string | null
          last_purchase_at: string | null
          last_attended_at: string | null
          notify_center_messages: boolean
          notify_class_result: boolean
          notify_point_earn: boolean
          notify_reservation: boolean
          attendance_no: string | null
          current_membership: string | null
          current_pass: string | null
          current_rental: string | null
          current_locker: string | null
          face_image_data: string | null
          face_image_thumb: string | null
          face_descriptor: Json | null
          face_consent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_type: string
          name: string
          phone?: string | null
          email?: string | null
          birth?: string | null
          gender?: string | null
          linked_firebase_uid?: string | null
          memo?: string | null
          status?: string
          address?: string | null
          visit_route?: string | null
          workout_goal?: string | null
          counselor?: string | null
          mileage?: number
          marketing_consent?: boolean
          registered_at?: string | null
          registration_type?: string | null
          first_use_at?: string | null
          total_paid_won?: number
          final_expire_at?: string | null
          last_purchase_at?: string | null
          last_attended_at?: string | null
          notify_center_messages?: boolean
          notify_class_result?: boolean
          notify_point_earn?: boolean
          notify_reservation?: boolean
          attendance_no?: string | null
          current_membership?: string | null
          current_pass?: string | null
          current_rental?: string | null
          current_locker?: string | null
          face_image_data?: string | null
          face_image_thumb?: string | null
          face_descriptor?: Json | null
          face_consent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_type?: string
          name?: string
          phone?: string
          email?: string | null
          birth?: string | null
          gender?: string | null
          linked_firebase_uid?: string | null
          memo?: string | null
          status?: string
          address?: string | null
          visit_route?: string | null
          workout_goal?: string | null
          counselor?: string | null
          mileage?: number
          marketing_consent?: boolean
          registered_at?: string | null
          registration_type?: string | null
          first_use_at?: string | null
          total_paid_won?: number
          final_expire_at?: string | null
          last_purchase_at?: string | null
          last_attended_at?: string | null
          notify_center_messages?: boolean
          notify_class_result?: boolean
          notify_point_earn?: boolean
          notify_reservation?: boolean
          attendance_no?: string | null
          current_membership?: string | null
          current_pass?: string | null
          current_rental?: string | null
          current_locker?: string | null
          face_image_data?: string | null
          face_image_thumb?: string | null
          face_descriptor?: Json | null
          face_consent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_passes: {
        Row: {
          id: number
          center_id: number
          member_id: number
          trainer_member_id: number | null
          co_trainer_ids: number[]
          seller_member_id: number
          issue_type: string
          lesson_kind: string
          total_sessions: number
          remaining_sessions: number
          service_sessions: number
          session_minutes: number
          price_won: number
          discount_won: number
          vat_included: boolean
          payment_method: string
          payment_method_custom: string | null
          issued_at: string
          start_date: string
          expires_at: string
          status: string
          memo: string | null
          outstanding_won: number
          payment_status: string
          is_paused: boolean
          product_id: number | null
          group_capacity: number
          attendance_mileage_earn: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          trainer_member_id: number | null
          co_trainer_ids?: number[]
          seller_member_id: number
          issue_type: string
          lesson_kind: string
          total_sessions: number
          remaining_sessions: number
          service_sessions?: number
          session_minutes: number
          price_won?: number
          discount_won?: number
          vat_included?: boolean
          payment_method?: string
          payment_method_custom?: string | null
          issued_at: string
          start_date: string
          expires_at: string
          status?: string
          memo?: string | null
          outstanding_won?: number
          payment_status?: string
          is_paused?: boolean
          product_id?: number | null
          group_capacity?: number
          attendance_mileage_earn?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          trainer_member_id?: number | null
          co_trainer_ids?: number[]
          seller_member_id?: number
          issue_type?: string
          lesson_kind?: string
          total_sessions?: number
          remaining_sessions?: number
          service_sessions?: number
          session_minutes?: number
          price_won?: number
          discount_won?: number
          vat_included?: boolean
          payment_method?: string
          payment_method_custom?: string | null
          issued_at?: string
          start_date?: string
          expires_at?: string
          status?: string
          memo?: string | null
          outstanding_won?: number
          payment_status?: string
          is_paused?: boolean
          product_id?: number | null
          group_capacity?: number
          attendance_mileage_earn?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_consultation_templates: {
        Row: {
          id: number
          center_id: number
          name: string
          description: string | null
          is_default: boolean
          sort_order: number
          active: boolean
          definition: unknown
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          name: string
          description?: string | null
          is_default?: boolean
          sort_order?: number
          active?: boolean
          definition?: unknown
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          name?: string
          description?: string | null
          is_default?: boolean
          sort_order?: number
          active?: boolean
          definition?: unknown
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_pt_consultations: {
        Row: {
          id: number
          center_id: number
          member_id: number | null
          template_id: number | null
          name: string
          gender: string | null
          birth: string | null
          phone: string | null
          address_dong: string | null
          trainer_member_id: number | null
          trainer_name_custom: string | null
          recent_year_history: string | null
          past_sports: unknown
          past_sports_etc: string | null
          experience_length: string | null
          motivation: string | null
          goals: unknown
          goals_etc: string | null
          workout_method: string | null
          preferred_trainer: string | null
          referral_source: string | null
          meal_morning_time: string | null
          meal_morning_menu: string | null
          meal_lunch_time: string | null
          meal_lunch_menu: string | null
          meal_dinner_time: string | null
          meal_dinner_menu: string | null
          meal_habits: unknown
          preferred_foods: unknown
          preferred_foods_etc: string | null
          water_liters_per_day: number | null
          caffeine_cups_per_day: number | null
          alcohol_period: string | null
          alcohol_count: number | null
          smoking: boolean
          cigarettes_per_day: number | null
          supplements: string | null
          diet_experience: boolean
          diet_experience_detail: string | null
          job: string | null
          work_hours_start: string | null
          work_hours_end: string | null
          commute: string | null
          job_traits: unknown
          work_notes: string | null
          wake_hour: number | null
          wake_minute: number | null
          sleep_hour: number | null
          sleep_minute: number | null
          sleep_satisfaction: string | null
          condition_score: string | null
          fatigue_when: unknown
          fatigue_reason: string | null
          condition_notes: string | null
          injury_history: string | null
          pain_parts: unknown
          pain_parts_etc: string | null
          conditions: unknown
          safety_screening: unknown
          goal_details: unknown
          pain_details: unknown
          adherence_details: unknown
          coaching_preferences: unknown
          follow_up_details: unknown
          selection_other_details: unknown
          medications: string | null
          current_state: string | null
          weekly_freq: number | null
          planned_days: unknown
          planned_days_etc: string | null
          planned_time: string | null
          request_note: string | null
          status: string
          converted_at: string | null
          converted_pass_id: number | null
          lost_reason: string | null
          memo: string | null
          custom_data: unknown
          created_at: string
          updated_at: string
          created_by_uid: string
          consulted_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id?: number | null
          template_id?: number | null
          name: string
          gender?: string | null
          birth?: string | null
          phone?: string | null
          address_dong?: string | null
          trainer_member_id?: number | null
          trainer_name_custom?: string | null
          recent_year_history?: string | null
          past_sports?: unknown
          past_sports_etc?: string | null
          experience_length?: string | null
          motivation?: string | null
          goals?: unknown
          goals_etc?: string | null
          workout_method?: string | null
          preferred_trainer?: string | null
          referral_source?: string | null
          meal_morning_time?: string | null
          meal_morning_menu?: string | null
          meal_lunch_time?: string | null
          meal_lunch_menu?: string | null
          meal_dinner_time?: string | null
          meal_dinner_menu?: string | null
          meal_habits?: unknown
          preferred_foods?: unknown
          preferred_foods_etc?: string | null
          water_liters_per_day?: number | null
          caffeine_cups_per_day?: number | null
          alcohol_period?: string | null
          alcohol_count?: number | null
          smoking?: boolean
          cigarettes_per_day?: number | null
          supplements?: string | null
          diet_experience?: boolean
          diet_experience_detail?: string | null
          job?: string | null
          work_hours_start?: string | null
          work_hours_end?: string | null
          commute?: string | null
          job_traits?: unknown
          work_notes?: string | null
          wake_hour?: number | null
          wake_minute?: number | null
          sleep_hour?: number | null
          sleep_minute?: number | null
          sleep_satisfaction?: string | null
          condition_score?: string | null
          fatigue_when?: unknown
          fatigue_reason?: string | null
          condition_notes?: string | null
          injury_history?: string | null
          pain_parts?: unknown
          pain_parts_etc?: string | null
          conditions?: unknown
          safety_screening?: unknown
          goal_details?: unknown
          pain_details?: unknown
          adherence_details?: unknown
          coaching_preferences?: unknown
          follow_up_details?: unknown
          selection_other_details?: unknown
          medications?: string | null
          current_state?: string | null
          weekly_freq?: number | null
          planned_days?: unknown
          planned_days_etc?: string | null
          planned_time?: string | null
          request_note?: string | null
          status?: string
          converted_at?: string | null
          converted_pass_id?: number | null
          lost_reason?: string | null
          memo?: string | null
          custom_data?: unknown
          created_at?: string
          updated_at?: string
          created_by_uid: string
          consulted_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number | null
          template_id?: number | null
          name?: string
          gender?: string | null
          birth?: string | null
          phone?: string | null
          address_dong?: string | null
          trainer_member_id?: number | null
          trainer_name_custom?: string | null
          recent_year_history?: string | null
          past_sports?: unknown
          past_sports_etc?: string | null
          experience_length?: string | null
          motivation?: string | null
          goals?: unknown
          goals_etc?: string | null
          workout_method?: string | null
          preferred_trainer?: string | null
          referral_source?: string | null
          meal_morning_time?: string | null
          meal_morning_menu?: string | null
          meal_lunch_time?: string | null
          meal_lunch_menu?: string | null
          meal_dinner_time?: string | null
          meal_dinner_menu?: string | null
          meal_habits?: unknown
          preferred_foods?: unknown
          preferred_foods_etc?: string | null
          water_liters_per_day?: number | null
          caffeine_cups_per_day?: number | null
          alcohol_period?: string | null
          alcohol_count?: number | null
          smoking?: boolean
          cigarettes_per_day?: number | null
          supplements?: string | null
          diet_experience?: boolean
          diet_experience_detail?: string | null
          job?: string | null
          work_hours_start?: string | null
          work_hours_end?: string | null
          commute?: string | null
          job_traits?: unknown
          work_notes?: string | null
          wake_hour?: number | null
          wake_minute?: number | null
          sleep_hour?: number | null
          sleep_minute?: number | null
          sleep_satisfaction?: string | null
          condition_score?: string | null
          fatigue_when?: unknown
          fatigue_reason?: string | null
          condition_notes?: string | null
          injury_history?: string | null
          pain_parts?: unknown
          pain_parts_etc?: string | null
          conditions?: unknown
          safety_screening?: unknown
          goal_details?: unknown
          pain_details?: unknown
          adherence_details?: unknown
          coaching_preferences?: unknown
          follow_up_details?: unknown
          selection_other_details?: unknown
          medications?: string | null
          current_state?: string | null
          weekly_freq?: number | null
          planned_days?: unknown
          planned_days_etc?: string | null
          planned_time?: string | null
          request_note?: string | null
          status?: string
          converted_at?: string | null
          converted_pass_id?: number | null
          lost_reason?: string | null
          memo?: string | null
          custom_data?: unknown
          created_at?: string
          updated_at?: string
          created_by_uid?: string
          consulted_at?: string
        }
        Relationships: []
      }
      crm_reservations: {
        Row: {
          id: number
          center_id: number
          pass_id: number
          member_id: number
          trainer_member_id: number
          starts_at: string
          ends_at: string
          status: string
          consumed: boolean
          cancelled_reason: string | null
          cancelled_by_uid: string | null
          cancelled_at: string | null
          attended_at: string | null
          created_by_uid: string
          created_at: string
          updated_at: string
          source: string
          requested_at: string | null
          approved_at: string | null
          approved_by_uid: string | null
          rejected_reason: string | null
          booking_reason: string | null
          attendance_reminded_at: string | null
          reschedule_history: Json
        }
        Insert: {
          id?: number
          center_id: number
          pass_id: number
          member_id: number
          trainer_member_id: number
          starts_at: string
          ends_at: string
          status?: string
          consumed?: boolean
          cancelled_reason?: string | null
          cancelled_by_uid?: string | null
          cancelled_at?: string | null
          attended_at?: string | null
          created_by_uid: string
          created_at?: string
          updated_at?: string
          source?: string
          requested_at?: string | null
          approved_at?: string | null
          approved_by_uid?: string | null
          rejected_reason?: string | null
          booking_reason?: string | null
          reschedule_history?: Json
        }
        Update: {
          id?: number
          center_id?: number
          pass_id?: number
          member_id?: number
          trainer_member_id?: number
          starts_at?: string
          ends_at?: string
          status?: string
          consumed?: boolean
          cancelled_reason?: string | null
          cancelled_by_uid?: string | null
          cancelled_at?: string | null
          attended_at?: string | null
          created_by_uid?: string
          created_at?: string
          updated_at?: string
          source?: string
          requested_at?: string | null
          approved_at?: string | null
          approved_by_uid?: string | null
          rejected_reason?: string | null
          booking_reason?: string | null
          reschedule_history?: Json
        }
        Relationships: []
      }
      crm_member_device_tokens: {
        Row: {
          id: number
          member_id: number
          firebase_uid: string
          token: string
          platform: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          member_id: number
          firebase_uid: string
          token: string
          platform?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          member_id?: number
          firebase_uid?: string
          token?: string
          platform?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_member_workout_logs: {
        Row: {
          id: number
          center_id: number
          member_id: number
          log_date: string
          memo: string
          log_type: string
          created_by_uid: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          log_date?: string
          memo: string
          log_type?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          log_date?: string
          memo?: string
          log_type?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_member_daily_records: {
        Row: {
          id: number
          center_id: number
          member_id: number
          record_date: string
          water_ml: number | null
          weight_kg: number | null
          mood: string | null
          exercise_minutes: number | null
          exercise_memo: string | null
          meal_summary: string | null
          memo: string | null
          share_with_trainer: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          member_id: number
          record_date: string
          water_ml?: number | null
          weight_kg?: number | null
          mood?: string | null
          exercise_minutes?: number | null
          exercise_memo?: string | null
          meal_summary?: string | null
          memo?: string | null
          share_with_trainer?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          member_id?: number
          record_date?: string
          water_ml?: number | null
          weight_kg?: number | null
          mood?: string | null
          exercise_minutes?: number | null
          exercise_memo?: string | null
          meal_summary?: string | null
          memo?: string | null
          share_with_trainer?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_member_record_items: {
        Row: {
          id: number
          record_id: number
          member_id: number
          center_id: number
          type: string
          label: string | null
          value_json: Json | null
          photo_url: string | null
          thumb_url: string | null
          created_at: string
        }
        Insert: {
          id?: number
          record_id: number
          member_id: number
          center_id: number
          type: string
          label?: string | null
          value_json?: Json | null
          photo_url?: string | null
          thumb_url?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          record_id?: number
          member_id?: number
          center_id?: number
          type?: string
          label?: string | null
          value_json?: Json | null
          photo_url?: string | null
          thumb_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_member_notifications: {
        Row: {
          id: number
          center_id: number | null
          member_id: number
          type: string
          title: string
          body: string | null
          data_json: Json | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id?: number | null
          member_id: number
          type: string
          title: string
          body?: string | null
          data_json?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number | null
          member_id?: number
          type?: string
          title?: string
          body?: string | null
          data_json?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_staff_notifications: {
        Row: {
          id: number
          center_id: number
          center_member_id: number
          type: string
          title: string
          body: string | null
          data_json: Json | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          center_member_id: number
          type: string
          title: string
          body?: string | null
          data_json?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          center_member_id?: number
          type?: string
          title?: string
          body?: string | null
          data_json?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_staff_notification_prefs: {
        Row: {
          center_member_id: number
          center_id: number | null
          notify_reservation_request: boolean
          notify_reservation_cancelled: boolean
          notify_attendance: boolean
          notify_signup_purchase: boolean
          updated_at: string
        }
        Insert: {
          center_member_id: number
          center_id?: number | null
          notify_reservation_request?: boolean
          notify_reservation_cancelled?: boolean
          notify_attendance?: boolean
          notify_signup_purchase?: boolean
          updated_at?: string
        }
        Update: {
          center_member_id?: number
          center_id?: number | null
          notify_reservation_request?: boolean
          notify_reservation_cancelled?: boolean
          notify_attendance?: boolean
          notify_signup_purchase?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crm_staff_device_tokens: {
        Row: {
          token: string
          firebase_uid: string
          center_member_id: number | null
          platform: string | null
          updated_at: string
        }
        Insert: {
          token: string
          firebase_uid: string
          center_member_id?: number | null
          platform?: string | null
          updated_at?: string
        }
        Update: {
          token?: string
          firebase_uid?: string
          center_member_id?: number | null
          platform?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_member_mileage_logs: {
        Row: {
          id: number
          center_id: number | null
          member_id: number
          delta: number
          reason: string
          balance_after: number | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id?: number | null
          member_id: number
          delta: number
          reason: string
          balance_after?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number | null
          member_id?: number
          delta?: number
          reason?: string
          balance_after?: number | null
          created_at?: string
        }
        Relationships: []
      }
      crm_payout_rules: {
        Row: {
          id: number
          center_id: number
          target_member_id: number | null
          mode: string
          tier_index: number
          min_pass_price_won: number
          max_pass_price_won: number | null
          new_member_value: number
          renewal_value: number
          trial_value: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          target_member_id?: number | null
          mode: string
          tier_index: number
          min_pass_price_won?: number
          max_pass_price_won?: number | null
          new_member_value?: number
          renewal_value?: number
          trial_value?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          target_member_id?: number | null
          mode?: string
          tier_index?: number
          min_pass_price_won?: number
          max_pass_price_won?: number | null
          new_member_value?: number
          renewal_value?: number
          trial_value?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_touch_attendance_settings: {
        Row: {
          center_id: number
          msg_active_entry: string
          msg_birthday_entry: string
          msg_expiring_membership: string
          msg_exit: string
          msg_outstanding: string
          msg_expired_membership: string
          msg_expired_rental: string
          msg_expired_locker: string
          msg_expired_rental_days: number
          msg_expired_locker_days: number
          msg_holding: string
          msg_scheduled_membership: string
          msg_active_entry_enabled: boolean
          msg_birthday_entry_enabled: boolean
          msg_expiring_membership_enabled: boolean
          msg_exit_enabled: boolean
          msg_outstanding_enabled: boolean
          msg_expired_membership_enabled: boolean
          msg_expired_rental_enabled: boolean
          msg_expired_locker_enabled: boolean
          msg_holding_enabled: boolean
          msg_scheduled_membership_enabled: boolean
          photo_suggest_enabled: boolean
          identifier_use_number: boolean
          identifier_use_phone: boolean
          identifier_use_unified: boolean
          attendance_mode_enabled: boolean
          staff_call_enabled: boolean
          exit_enabled: boolean
          entry_reentry_minutes: number
          lesson_reentry_until_end: boolean
          attendance_mileage_earn: number
          expiring_threshold_days: number
          face_threshold: number
          updated_at: string
        }
        Insert: {
          center_id: number
          msg_active_entry?: string
          msg_birthday_entry?: string
          msg_expiring_membership?: string
          msg_exit?: string
          msg_outstanding?: string
          msg_expired_membership?: string
          msg_expired_rental?: string
          msg_expired_locker?: string
          msg_expired_rental_days?: number
          msg_expired_locker_days?: number
          msg_holding?: string
          msg_scheduled_membership?: string
          msg_active_entry_enabled?: boolean
          msg_birthday_entry_enabled?: boolean
          msg_expiring_membership_enabled?: boolean
          msg_exit_enabled?: boolean
          msg_outstanding_enabled?: boolean
          msg_expired_membership_enabled?: boolean
          msg_expired_rental_enabled?: boolean
          msg_expired_locker_enabled?: boolean
          msg_holding_enabled?: boolean
          msg_scheduled_membership_enabled?: boolean
          photo_suggest_enabled?: boolean
          identifier_use_number?: boolean
          identifier_use_phone?: boolean
          identifier_use_unified?: boolean
          attendance_mode_enabled?: boolean
          staff_call_enabled?: boolean
          exit_enabled?: boolean
          entry_reentry_minutes?: number
          lesson_reentry_until_end?: boolean
          attendance_mileage_earn?: number
          expiring_threshold_days?: number
          face_threshold?: number
          updated_at?: string
        }
        Update: {
          center_id?: number
          msg_active_entry?: string
          msg_birthday_entry?: string
          msg_expiring_membership?: string
          msg_exit?: string
          msg_outstanding?: string
          msg_expired_membership?: string
          msg_expired_rental?: string
          msg_expired_locker?: string
          msg_expired_rental_days?: number
          msg_expired_locker_days?: number
          msg_holding?: string
          msg_scheduled_membership?: string
          msg_active_entry_enabled?: boolean
          msg_birthday_entry_enabled?: boolean
          msg_expiring_membership_enabled?: boolean
          msg_exit_enabled?: boolean
          msg_outstanding_enabled?: boolean
          msg_expired_membership_enabled?: boolean
          msg_expired_rental_enabled?: boolean
          msg_expired_locker_enabled?: boolean
          msg_holding_enabled?: boolean
          msg_scheduled_membership_enabled?: boolean
          photo_suggest_enabled?: boolean
          identifier_use_number?: boolean
          identifier_use_phone?: boolean
          identifier_use_unified?: boolean
          attendance_mode_enabled?: boolean
          staff_call_enabled?: boolean
          exit_enabled?: boolean
          entry_reentry_minutes?: number
          lesson_reentry_until_end?: boolean
          attendance_mileage_earn?: number
          expiring_threshold_days?: number
          face_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_attendance_voice_rules: {
        Row: {
          id: number
          center_id: number
          trigger_type: string
          threshold_int: number | null
          message: string
          enabled: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          trigger_type: string
          threshold_int?: number | null
          message: string
          enabled?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          trigger_type?: string
          threshold_int?: number | null
          message?: string
          enabled?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_center_settings: {
        Row: {
          center_id: number
          cancel_hours: number
          cancel_enabled: boolean
          booking_enabled: boolean
          class_booking_enabled: boolean
          member_can_self_cancel_consumed: boolean
          booking_unit_min: number
          booking_horizon_days: number
          notify_cancel: boolean
          notify_change: boolean
          notify_attend: boolean
          notify_register: boolean
          notify_pass_issue: boolean
          working_hours_start: string
          working_hours_end: string
          default_columns: number
          checkout_mileage_enabled: boolean
          checkout_mileage_earn: number
          updated_at: string
        }
        Insert: {
          center_id: number
          cancel_hours?: number
          class_booking_enabled?: boolean
          member_can_self_cancel_consumed?: boolean
          booking_unit_min?: number
          booking_horizon_days?: number
          notify_cancel?: boolean
          notify_change?: boolean
          notify_attend?: boolean
          notify_register?: boolean
          notify_pass_issue?: boolean
          working_hours_start?: string
          working_hours_end?: string
          default_columns?: number
          updated_at?: string
        }
        Update: {
          center_id?: number
          cancel_hours?: number
          class_booking_enabled?: boolean
          member_can_self_cancel_consumed?: boolean
          booking_unit_min?: number
          booking_horizon_days?: number
          notify_cancel?: boolean
          notify_change?: boolean
          notify_attend?: boolean
          notify_register?: boolean
          notify_pass_issue?: boolean
          working_hours_start?: string
          working_hours_end?: string
          default_columns?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_auto_message_settings: {
        Row: {
          id: number
          center_id: number
          trigger_key: string
          enabled: boolean
          name: string | null
          send_basis: string
          send_days: number | null
          send_count: number | null
          methods: Json
          audience: Json
          message_body: string
          coupon_id: number | null
          config: Json
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          trigger_key: string
          enabled?: boolean
          name?: string | null
          send_basis?: string
          send_days?: number | null
          send_count?: number | null
          methods?: Json
          audience?: Json
          message_body?: string
          coupon_id?: number | null
          config?: Json
          updated_at?: string
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          trigger_key?: string
          enabled?: boolean
          name?: string | null
          send_basis?: string
          send_days?: number | null
          send_count?: number | null
          methods?: Json
          audience?: Json
          message_body?: string
          coupon_id?: number | null
          config?: Json
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      crm_auto_message_queue: {
        Row: {
          id: number
          center_id: number
          trigger_key: string
          member_id: number
          message: string
          methods: Json
          status: string
          dedupe_key: string
          scheduled_for: string | null
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: number
          center_id: number
          trigger_key: string
          member_id: number
          message?: string
          methods?: Json
          status?: string
          dedupe_key: string
          scheduled_for?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: number
          center_id?: number
          trigger_key?: string
          member_id?: number
          message?: string
          methods?: Json
          status?: string
          dedupe_key?: string
          scheduled_for?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      crm_sms_logs: {
        Row: {
          id: number
          center_id: number
          sender: string
          receivers: string
          receiver_cnt: number
          msg: string
          msg_type: string | null
          title: string | null
          testmode: boolean
          result_code: number | null
          result_msg: string | null
          success_cnt: number | null
          error_cnt: number | null
          aligo_msg_id: string | null
          sent_by_uid: string | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          sender: string
          receivers: string
          receiver_cnt?: number
          msg: string
          msg_type?: string | null
          title?: string | null
          testmode?: boolean
          result_code?: number | null
          result_msg?: string | null
          success_cnt?: number | null
          error_cnt?: number | null
          aligo_msg_id?: string | null
          sent_by_uid?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          sender?: string
          receivers?: string
          receiver_cnt?: number
          msg?: string
          msg_type?: string | null
          title?: string | null
          testmode?: boolean
          result_code?: number | null
          result_msg?: string | null
          success_cnt?: number | null
          error_cnt?: number | null
          aligo_msg_id?: string | null
          sent_by_uid?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_message_phrases: {
        Row: {
          id: number
          center_id: number
          text: string
          created_by_uid: string | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          text: string
          created_by_uid?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          text?: string
          created_by_uid?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crm_class_sessions: {
        Row: {
          id: number
          center_id: number
          product_id: number
          trainer_member_id: number | null
          title: string | null
          starts_at: string
          ends_at: string
          capacity: number
          status: string
          created_by_uid: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          center_id: number
          product_id: number
          trainer_member_id?: number | null
          title?: string | null
          starts_at: string
          ends_at: string
          capacity?: number
          status?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          product_id?: number
          trainer_member_id?: number | null
          title?: string | null
          starts_at?: string
          ends_at?: string
          capacity?: number
          status?: string
          created_by_uid?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_class_bookings: {
        Row: {
          id: number
          center_id: number
          session_id: number
          member_id: number
          pass_id: number | null
          status: string
          consumed: boolean
          booked_at: string
          cancelled_at: string | null
          attended_at: string | null
        }
        Insert: {
          id?: number
          center_id: number
          session_id: number
          member_id: number
          pass_id?: number | null
          status?: string
          consumed?: boolean
          booked_at?: string
          cancelled_at?: string | null
          attended_at?: string | null
        }
        Update: {
          id?: number
          center_id?: number
          session_id?: number
          member_id?: number
          pass_id?: number | null
          status?: string
          consumed?: boolean
          booked_at?: string
          cancelled_at?: string | null
          attended_at?: string | null
        }
        Relationships: []
      }
      crm_audit_logs: {
        Row: {
          id: number
          center_id: number
          actor_uid: string
          action: string
          entity_type: string
          entity_id: number | null
          payload: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          center_id: number
          actor_uid: string
          action: string
          entity_type: string
          entity_id?: number | null
          payload?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          center_id?: number
          actor_uid?: string
          action?: string
          entity_type?: string
          entity_id?: number | null
          payload?: Json | null
          created_at?: string
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
