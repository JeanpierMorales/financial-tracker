import type { Account } from './account'

export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  remaining: number
  percentage: number
  accountId?: string | null
  account?: Pick<Account, 'id' | 'name' | 'type' | 'currency' | 'color'> | null
  deadline?: string | null
  status: GoalStatus
  color?: string | null
}
