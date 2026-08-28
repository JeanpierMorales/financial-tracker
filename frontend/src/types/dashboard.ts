import type { Account, CurrencyCode } from './account'

export interface CurrencyBalance {
  currency: CurrencyCode
  availableBalance: number
  savings: number
  investments: number
  totalBalance: number
}

export interface Summary {
  income: number
  expenses: number
  balance: number
  dailyAverage: number
  expensePercentage: number
  transfers?: number
  availableBalance?: number
  savings?: number
  investments?: number
  totalBalance?: number
  netWorth?: number
  balancesByCurrency?: CurrencyBalance[]
  savingsGoals?: { current: number; target: number }
  accounts?: Account[]
}

export interface CategorySummary {
  categoryId?: string | null
  category: string
  color?: string | null
  amount: number
  percentage: number
}

export interface Evolution {
  period?: string
  month: string
  income: number
  expenses: number
  transfers?: number
  balance: number
}
