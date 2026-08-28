import type { Category } from './category'
import type { Account } from './account'

export type MovementType = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type PaymentMethod = 'CASH' | 'YAPE' | 'BANK_TRANSFER'
export interface Movement {
  id: string; type: MovementType; amount: string | number; description?: string | null
  date: string; paymentMethod: PaymentMethod; destinationPaymentMethod?: PaymentMethod
  categoryId?: string; category?: Category
  sourceAccountId?: string | null; destinationAccountId?: string | null
  sourceAccount?: Account | null; destinationAccount?: Account | null
}
