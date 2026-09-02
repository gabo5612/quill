export type Database = {
  app: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          name: string
          global_role: 'admin' | 'editor' | 'viewer'
          created_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          global_role?: 'admin' | 'editor' | 'viewer'
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          global_role?: 'admin' | 'editor' | 'viewer'
          created_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          status: 'active' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          status?: 'active' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          status?: 'active' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_members: {
        Row: {
          brand_id: string
          user_id: string
          brand_role: 'owner' | 'editor' | 'viewer'
          created_at: string
        }
        Insert: {
          brand_id: string
          user_id: string
          brand_role?: 'owner' | 'editor' | 'viewer'
          created_at?: string
        }
        Update: {
          brand_id?: string
          user_id?: string
          brand_role?: 'owner' | 'editor' | 'viewer'
          created_at?: string
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          id: string
          brand_id: string
          tone_of_voice: string | null
          audience: string | null
          key_messages: string | null
          dos: string | null
          donts: string | null
          banned_words: string[] | null
          language: string[]
          copy_examples: string | null
          ctas: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          tone_of_voice?: string | null
          audience?: string | null
          key_messages?: string | null
          dos?: string | null
          donts?: string | null
          banned_words?: string[] | null
          language?: string[]
          copy_examples?: string | null
          ctas?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          tone_of_voice?: string | null
          audience?: string | null
          key_messages?: string | null
          dos?: string | null
          donts?: string | null
          banned_words?: string[] | null
          language?: string[]
          copy_examples?: string | null
          ctas?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brand_documents: {
        Row: {
          id: string
          brand_id: string
          name: string
          storage_path: string
          file_type: string
          ingestion_status: 'pending' | 'processing' | 'done' | 'error'
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          name: string
          storage_path: string
          file_type: string
          ingestion_status?: 'pending' | 'processing' | 'done' | 'error'
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          name?: string
          storage_path?: string
          file_type?: string
          ingestion_status?: 'pending' | 'processing' | 'done' | 'error'
          created_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          id: string
          brand_id: string
          document_id: string | null
          content: string
          embedding: string | number[] | null
          source: 'doc' | 'profile'
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          document_id?: string | null
          content: string
          embedding?: string | number[] | null
          source: 'doc' | 'profile'
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          document_id?: string | null
          content?: string
          embedding?: string | number[] | null
          source?: 'doc' | 'profile'
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          id: string
          brand_id: string
          author_id: string
          status: 'draft' | 'in_review' | 'approved' | 'exported'
          model_provider: 'openai' | 'anthropic'
          model_id: string
          objective: string | null
          keywords: string[] | null
          title: string | null
          target_words: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          author_id: string
          status?: 'draft' | 'in_review' | 'approved' | 'exported'
          model_provider: 'openai' | 'anthropic'
          model_id: string
          objective?: string | null
          keywords?: string[] | null
          title?: string | null
          target_words?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          author_id?: string
          status?: 'draft' | 'in_review' | 'approved' | 'exported'
          model_provider?: 'openai' | 'anthropic'
          model_id?: string
          objective?: string | null
          keywords?: string[] | null
          title?: string | null
          target_words?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      article_body: {
        Row: {
          article_id: string
          body_prosemirror: Record<string, unknown>
          body_html: string | null
          body_markdown: string | null
          title_tag: string | null
          meta_description: string | null
          slug: string | null
          jsonld: Record<string, unknown> | null
          updated_at: string
        }
        Insert: {
          article_id: string
          body_prosemirror: Record<string, unknown>
          body_html?: string | null
          body_markdown?: string | null
          title_tag?: string | null
          meta_description?: string | null
          slug?: string | null
          jsonld?: Record<string, unknown> | null
          updated_at?: string
        }
        Update: {
          article_id?: string
          body_prosemirror?: Record<string, unknown>
          body_html?: string | null
          body_markdown?: string | null
          title_tag?: string | null
          meta_description?: string | null
          slug?: string | null
          jsonld?: Record<string, unknown> | null
          updated_at?: string
        }
        Relationships: []
      }
      keywords: {
        Row: {
          id: string
          brand_id: string
          term: string
          volume: number | null
          difficulty: number | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          term: string
          volume?: number | null
          difficulty?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          term?: string
          volume?: number | null
          difficulty?: number | null
          created_at?: string
        }
        Relationships: []
      }
      schedule_entries: {
        Row: {
          id: string
          brand_id: string
          author_id: string
          scheduled_at: string
          objective: string | null
          keywords: string[] | null
          model_provider: string
          model_id: string
          target_words: number | null
          content_type: string | null
          notes: string | null
          status: 'pending' | 'claimed' | 'generating' | 'done' | 'error'
          article_id: string | null
          claimed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          author_id: string
          scheduled_at: string
          objective?: string | null
          keywords?: string[] | null
          model_provider: string
          model_id: string
          target_words?: number | null
          content_type?: string | null
          notes?: string | null
          status?: 'pending' | 'claimed' | 'generating' | 'done' | 'error'
          article_id?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          author_id?: string
          scheduled_at?: string
          objective?: string | null
          keywords?: string[] | null
          model_provider?: string
          model_id?: string
          target_words?: number | null
          content_type?: string | null
          notes?: string | null
          status?: 'pending' | 'claimed' | 'generating' | 'done' | 'error'
          article_id?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      generations: {
        Row: {
          id: string
          article_id: string | null
          brand_id: string
          provider: string
          model_id: string
          step: 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done' | null
          payload: Record<string, unknown> | null
          tokens_in: number | null
          tokens_out: number | null
          cost_usd: number | null
          duration_ms: number | null
          status: 'success' | 'error'
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          article_id?: string | null
          brand_id: string
          provider: string
          model_id: string
          step?: 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done' | null
          payload?: Record<string, unknown> | null
          tokens_in?: number | null
          tokens_out?: number | null
          cost_usd?: number | null
          duration_ms?: number | null
          status: 'success' | 'error'
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          article_id?: string | null
          brand_id?: string
          provider?: string
          model_id?: string
          step?: 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done' | null
          payload?: Record<string, unknown> | null
          tokens_in?: number | null
          tokens_out?: number | null
          cost_usd?: number | null
          duration_ms?: number | null
          status?: 'success' | 'error'
          error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          resource_type: string
          resource_id: string | null
          brand_id: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          brand_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          resource_type?: string
          resource_id?: string | null
          brand_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
      ai_models: {
        Row: {
          id: string
          provider: 'openai' | 'anthropic'
          model_id: string
          label: string
          capabilities: string[]
          active: boolean
          is_flagship: boolean
        }
        Insert: {
          id?: string
          provider: 'openai' | 'anthropic'
          model_id: string
          label: string
          capabilities?: string[]
          active?: boolean
          is_flagship?: boolean
        }
        Update: {
          id?: string
          provider?: 'openai' | 'anthropic'
          model_id?: string
          label?: string
          capabilities?: string[]
          active?: boolean
          is_flagship?: boolean
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      match_brand_chunks: {
        Args: { p_brand_id: string; p_embedding: string | number[]; p_top_k?: number }
        Returns: Array<{ id: string; content: string; source: string; similarity: number }>
      }
    }
    Enums: Record<string, never>
  }
}

// Convenience aliases
export type Tables<T extends keyof Database['app']['Tables']> =
  Database['app']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['app']['Tables']> =
  Database['app']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['app']['Tables']> =
  Database['app']['Tables'][T]['Update']
