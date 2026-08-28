export type AccountType = 'CASH' | 'BANK' | 'WALLET' | 'SAVINGS' | 'INVESTMENT' | 'OTHER'
export type CurrencyCode = 'PEN' | 'USD'

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: CurrencyCode
  initialBalance: number
  institution?: string | null
  lastFour?: string | null
  color?: string | null
  isActive: boolean
  incoming: number
  outgoing: number
  balance: number
}
