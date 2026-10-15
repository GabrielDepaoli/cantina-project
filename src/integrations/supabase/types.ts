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
      configuracao: {
        Row: {
          atualizado_em: string
          dia_fechamento: number
          id: boolean
        }
        Insert: {
          atualizado_em?: string
          dia_fechamento?: number
          id?: boolean
        }
        Update: {
          atualizado_em?: string
          dia_fechamento?: number
          id?: boolean
        }
        Relationships: []
      }
      configuracao_historico: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          aviso_confirmado: boolean
          dia_anterior: number
          dia_novo: number
          id: number
          transicao_fim: string | null
          transicao_inicio: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          aviso_confirmado?: boolean
          dia_anterior: number
          dia_novo: number
          id?: never
          transicao_fim?: string | null
          transicao_inicio?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          aviso_confirmado?: boolean
          dia_anterior?: number
          dia_novo?: number
          id?: never
          transicao_fim?: string | null
          transicao_inicio?: string | null
        }
        Relationships: []
      }
      fechamento_itens: {
        Row: {
          fiador_id: string | null
          id: string
          nome_aluno: string
          numero_ficha: string
          periodo_id: string
          quitado_em: string | null
          quitado_por_pagamento_id: string | null
          saldo_congelado: number
        }
        Insert: {
          fiador_id?: string | null
          id?: string
          nome_aluno: string
          numero_ficha: string
          periodo_id: string
          quitado_em?: string | null
          quitado_por_pagamento_id?: string | null
          saldo_congelado: number
        }
        Update: {
          fiador_id?: string | null
          id?: string
          nome_aluno?: string
          numero_ficha?: string
          periodo_id?: string
          quitado_em?: string | null
          quitado_por_pagamento_id?: string | null
          saldo_congelado?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_itens_fiador_id_fkey"
            columns: ["fiador_id"]
            isOneToOne: false
            referencedRelation: "fiadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_itens_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos_fechamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_itens_quitado_por_pagamento_id_fkey"
            columns: ["quitado_por_pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fiadores: {
        Row: {
          bloqueada: boolean
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
          somente_credito: boolean
          status: string
          telefone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          bloqueada?: boolean
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
          somente_credito?: boolean
          status?: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          bloqueada?: boolean
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
          somente_credito?: boolean
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
      periodo_divergencias: {
        Row: {
          fiador_id: string | null
          id: string
          nome_aluno: string
          numero_ficha: string
          periodo_id: string
          saldo_atual: number
          saldo_razao: number
        }
        Insert: {
          fiador_id?: string | null
          id?: string
          nome_aluno: string
          numero_ficha: string
          periodo_id: string
          saldo_atual: number
          saldo_razao: number
        }
        Update: {
          fiador_id?: string | null
          id?: string
          nome_aluno?: string
          numero_ficha?: string
          periodo_id?: string
          saldo_atual?: number
          saldo_razao?: number
        }
        Relationships: [
          {
            foreignKeyName: "periodo_divergencias_fiador_id_fkey"
            columns: ["fiador_id"]
            isOneToOne: false
            referencedRelation: "fiadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodo_divergencias_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos_fechamento"
            referencedColumns: ["id"]
          },
        ]
      }
      periodos_fechamento: {
        Row: {
          data_fim: string
          data_inicio: string
          dia_ancora: number
          fechado_em: string
          fechado_por: string | null
          id: string
          periodo_anterior_id: string | null
          transicao: boolean
        }
        Insert: {
          data_fim: string
          data_inicio: string
          dia_ancora: number
          fechado_em?: string
          fechado_por?: string | null
          id?: string
          periodo_anterior_id?: string | null
          transicao?: boolean
        }
        Update: {
          data_fim?: string
          data_inicio?: string
          dia_ancora?: number
          fechado_em?: string
          fechado_por?: string | null
          id?: string
          periodo_anterior_id?: string | null
          transicao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "periodos_fechamento_periodo_anterior_id_fkey"
            columns: ["periodo_anterior_id"]
            isOneToOne: true
            referencedRelation: "periodos_fechamento"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_atraso_fichas: {
        Row: {
          atraso: number | null
          desde: string | null
          fiador_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_itens_fiador_id_fkey"
            columns: ["fiador_id"]
            isOneToOne: false
            referencedRelation: "fiadores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      definir_dia_fechamento: {
        Args: {
          p_confirmar_aviso?: boolean
          p_dia: number
        }
        Returns: {
          atualizado_em: string
          dia_fechamento: number
          id: boolean
        }
      }
      fechar_periodo: {
        Args: {
          p_data_inicio: string
          p_divergencias_confirmadas?: Json
        }
        Returns: {
          data_fim: string
          data_inicio: string
          dia_ancora: number
          fechado_em: string
          fechado_por: string | null
          id: string
          periodo_anterior_id: string | null
          transicao: boolean
        }
      }
      previa_fechamento: {
        Args: Record<PropertyKey, never>
        Returns: {
          data_fim: string
          data_inicio: string
          fichas: number
          total: number
          transicao: boolean
        }[]
      }
      proximos_periodos: {
        Args: Record<PropertyKey, never>
        Returns: {
          data_fim: string
          data_inicio: string
          ordem: number
          pendente: boolean
          transicao: boolean
        }[]
      }
      simular_troca_dia: {
        Args: {
          p_dia: number
        }
        Returns: Json
      }
      transicao_aberta: {
        Args: Record<PropertyKey, never>
        Returns: {
          dia_anterior: number
          dia_novo: number
          transicao_fim: string
          transicao_inicio: string
        }[]
      }
      verificar_divergencias: {
        Args: Record<PropertyKey, never>
        Returns: {
          fiador_id: string
          nome_aluno: string
          numero_ficha: string
          saldo_atual: number
          saldo_razao: number
        }[]
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
