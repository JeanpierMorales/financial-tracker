import type { Category } from './category'

export type MovementType = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type PaymentMethod = 'CASH' | 'YAPE' | 'BANK_TRANSFER'
export interface Movement {
  id: string; type: MovementType; amount: string | number; description?: string
  date: string; paymentMethod: PaymentMethod; destinationPaymentMethod?: PaymentMethod
  categoryId?: string; category?: Category
}
