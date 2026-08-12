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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      compras: {
        Row: {
          created_at: string
          data: string
          descricao: string
          fechado: boolean
          fiador_id: string
          id: string
          mes_referencia: string
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string
          descricao: string
          fechado?: boolean
          fiador_id: string
          id?: string
          mes_referencia: string
          valor: number
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string
          fechado?: boolean
          fiador_id?: string
          id?: string
          mes_referencia?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_fiador_id_fkey"
            columns: ["fiador_id"]
            isOneToOne: false
            referencedRelation: "fiadores"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos: {
        Row: {
          created_at: string
          data_pagamento: string
          fiador_id: string
          id: string
          mes_referencia: string
          total: number
          valor_pago: number
        }
        Insert: {
          created_at?: string
          data_pagamento?: string
          fiador_id: string
          id?: string
          mes_referencia: string
          total: number
          valor_pago?: number
        }
        Update: {
          created_at?: string
          data_pagamento?: string
          fiador_id?: string
          id?: string
          mes_referencia?: string
          total?: number
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_fiador_id_fkey"
            columns: ["fiador_id"]
            isOneToOne: false
            referencedRelation: "fiadores"
            referencedColumns: ["id"]
          },
        ]
      }
      fiadores: {
        Row: {
          created_at: string
          id: string
          nome_aluno: string
          nome_responsavel: string
          numero_ficha: string
          observacoes: string | null
          resp1_celular: string | null
          resp1_cpf: string | null
          resp2_celular: string | null
          resp2_cpf: string | null
          resp2_nome: string | null
          saldo_atual: number
          status: string
          telefone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome_aluno: string
          nome_responsavel: string
          numero_ficha: string
          observacoes?: string | null
          resp1_celular?: string | null
          resp1_cpf?: string | null
          resp2_celular?: string | null
          resp2_cpf?: string | null
          resp2_nome?: string | null
          saldo_atual?: number
          status?: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome_aluno?: string
          nome_responsavel?: string
          numero_ficha?: string
          observacoes?: string | null
          resp1_celular?: string | null
          resp1_cpf?: string | null
          resp2_celular?: string | null
          resp2_cpf?: string | null
          resp2_nome?: string | null
          saldo_atual?: number
          status?: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          created_at: string
          data: string
          fiador_id: string
          id: string
          observacao: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string
          fiador_id: string
          id?: string
          observacao?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          data?: string
          fiador_id?: string
          id?: string
          observacao?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_fiador_id_fkey"
            columns: ["fiador_id"]
            isOneToOne: false
            referencedRelation: "fiadores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fechar_mes: {
        Args: {
          p_mes_referencia: string
        }
        Returns: number
      }
      registrar_compra: {
        Args: {
          p_descricao: string
          p_fiador_id: string
          p_mes_referencia: string
          p_valor: number
        }
        Returns: {
          created_at: string
          data: string
          descricao: string
          fechado: boolean
          fiador_id: string
          id: string
          mes_referencia: string
          valor: number
        }
      }
      registrar_pagamento: {
        Args: {
          p_fiador_id: string
          p_observacao?: string
          p_valor: number
        }
        Returns: {
          created_at: string
          data: string
          fiador_id: string
          id: string
          observacao: string | null
          valor: number
        }
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
