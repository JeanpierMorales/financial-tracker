<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './config/supabase'
import { authService } from './services/auth.service'
import { api } from './services/api'
import type { Category } from './types/category'
import type { Movement, MovementType, PaymentMethod } from './types/movement'
import type { CategorySummary, Evolution, Summary } from './types/dashboard'
import type { Account, AccountType, CurrencyCode } from './types/account'
import type { GoalStatus, SavingsGoal } from './types/savings-goal'

type View = 'dashboard' | 'movements' | 'budgets' | 'wealth'
type Period = 'week' | 'month' | 'year' | 'all' | 'custom'
interface Budget { id: string; amount: string | number; startDate: string; endDate: string; categoryId: string; category?: Category }

const pad = (value: number) => String(value).padStart(2, '0')
const toDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const now = new Date()
const today = toDateInput(now)
const monthStart = toDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
const monthEnd = toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0))

const session = ref<Session | null>(null)
const loading = ref(true)
const busy = ref(false)
const view = ref<View>('dashboard')
const authMode = ref<'login' | 'signup'>('login')
const auth = reactive({ email: '', password: '' })
const message = ref('')
const movements = ref<Movement[]>([])
const allMovements = ref<Movement[]>([])
const categories = ref<Category[]>([])
const budgets = ref<Budget[]>([])
const accounts = ref<Account[]>([])
const savingsGoals = ref<SavingsGoal[]>([])
const summary = ref<Summary>({ income: 0, expenses: 0, balance: 0, dailyAverage: 0, expensePercentage: 0 })
const categoryData = ref<CategorySummary[]>([])
const evolution = ref<Evolution[]>([])
const composerOpen = ref(false)
const budgetComposerOpen = ref(false)
const accountComposerOpen = ref(false)
const goalComposerOpen = ref(false)
const progressComposerOpen = ref(false)
const categoryComposerOpen = ref(false)
const searchQuery = ref('')
const selectedPeriod = ref<Period>('month')

const filters = reactive({ type: '', categoryId: '', accountId: '', paymentMethod: '', startDate: monthStart, endDate: monthEnd })
const form = reactive({ id: '', type: 'EXPENSE' as MovementType, amount: '', description: '', date: today, paymentMethod: 'YAPE' as PaymentMethod, destinationPaymentMethod: 'CASH' as PaymentMethod, categoryId: '', sourceAccountId: '', destinationAccountId: '' })
const budgetForm = reactive({ amount: '', categoryId: '', startDate: monthStart, endDate: monthEnd })
const accountForm = reactive({ name: '', type: 'BANK' as AccountType, currency: 'PEN' as CurrencyCode, initialBalance: '', institution: '', lastFour: '', color: '#7257f5' })
const goalForm = reactive({ name: '', targetAmount: '', currentAmount: '', accountId: '', deadline: '', color: '#7257f5' })
const progressForm = reactive({ goalId: '', goalName: '', currency: 'PEN' as CurrencyCode, operation: 'ADD' as 'ADD' | 'SUBTRACT' | 'SET', amount: '' })
const categoryForm = reactive({ name: '', color: '#7257f5' })

const money = (value: number | string) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(Number(value) || 0)
const accountMoney = (value: number | string, currency: CurrencyCode = 'PEN') => new Intl.NumberFormat('es-PE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(value) || 0)
const compactMoney = (value: number | string) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: Number(value) >= 10000 ? 1 : 2 }).format(Number(value) || 0)
const labels: Record<string, string> = { INCOME: 'Ingreso', EXPENSE: 'Gasto', TRANSFER: 'Transferencia', CASH: 'Efectivo', YAPE: 'Yape', BANK_TRANSFER: 'Banco', UNIVERSITY: 'Universidad', TRANSPORT: 'Transporte', FOOD: 'Comida', ENTERTAINMENT: 'Entretenimiento', CLOTHING: 'Ropa', TECHNOLOGY: 'Tecnología', OTHER: 'Otros' }
const accountTypeLabels: Record<AccountType, string> = { CASH: 'Efectivo', BANK: 'Cuenta bancaria', WALLET: 'Billetera digital', SAVINGS: 'Ahorros', INVESTMENT: 'Inversión', OTHER: 'Otra cuenta' }
const goalStatusLabels: Record<GoalStatus, string> = { ACTIVE: 'En progreso', PAUSED: 'Pausada', COMPLETED: 'Completada', CANCELLED: 'Cancelada' }
const categoryPalette = ['#7257f5', '#9a83ff', '#baabff', '#d8d0ff', '#4f3fb0', '#8774d5', '#c7bdf1']
const categoryColor = (index: number) => categoryPalette[index % categoryPalette.length]
const summaryCategoryColor = (category: CategorySummary, index: number) => category.color || categoryColor(index)
const categoryLabel = (category?: string) => labels[category || ''] || category || 'Sin categoría'
const monthMax = computed(() => Math.max(1, ...evolution.value.flatMap((item) => [item.income, item.expenses])))
const chartRows = computed(() => evolution.value.slice(-7))
const savingsRate = computed(() => summary.value.income > 0 ? Math.max(0, summary.value.balance / summary.value.income * 100) : 0)
const penNetWorth = computed(() => accounts.value.filter((account) => account.currency === 'PEN').reduce((total, account) => total + Number(account.balance), 0))
const usdNetWorth = computed(() => accounts.value.filter((account) => account.currency === 'USD').reduce((total, account) => total + Number(account.balance), 0))
const savingsBalance = computed(() => accounts.value.filter((account) => account.currency === 'PEN' && ['SAVINGS', 'INVESTMENT'].includes(account.type)).reduce((total, account) => total + Number(account.balance), 0))
const goalTotals = computed(() => savingsGoals.value.reduce((total, goal) => { total.current += Number(goal.currentAmount); total.target += Number(goal.targetAmount); total.remaining += Number(goal.remaining); return total }, { current: 0, target: 0, remaining: 0 }))
const savingsAccounts = computed(() => accounts.value.filter((account) => ['SAVINGS', 'INVESTMENT'].includes(account.type)))
const goalCurrency = computed<CurrencyCode>(() => savingsAccounts.value.find((account) => account.id === goalForm.accountId)?.currency || 'PEN')
const transferDestinationAccounts = computed(() => {
  const source = accounts.value.find((account) => account.id === form.sourceAccountId)
  return accounts.value.filter((account) => account.id !== form.sourceAccountId && (!source || account.currency === source.currency))
})
const movementAccountsInvalid = computed(() => {
  if (!accounts.value.length) return form.type === 'TRANSFER' && form.paymentMethod === form.destinationPaymentMethod
  if (form.type === 'EXPENSE') return !form.sourceAccountId
  if (form.type === 'INCOME') return !form.destinationAccountId
  const source = accounts.value.find((account) => account.id === form.sourceAccountId)
  const destination = accounts.value.find((account) => account.id === form.destinationAccountId)
  return !form.sourceAccountId || !form.destinationAccountId || form.sourceAccountId === form.destinationAccountId || Boolean(source && destination && source.currency !== destination.currency)
})
const userName = computed(() => {
  const metadataName = session.value?.user?.user_metadata?.full_name || session.value?.user?.user_metadata?.name
  const fallback = session.value?.user?.email?.split('@')[0] || 'tu espacio'
  const name = String(metadataName || fallback).split(' ')[0]
  return name.charAt(0).toUpperCase() + name.slice(1)
})
const userInitial = computed(() => userName.value.charAt(0).toUpperCase())
const greeting = computed(() => { const hour = new Date().getHours(); return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches' })
const viewTitle = computed(() => ({ dashboard: `${greeting.value}, ${userName.value}`, movements: 'Todos tus movimientos', budgets: 'Presupuestos mensuales', wealth: 'Tu patrimonio' })[view.value])
const viewDescription = computed(() => ({ dashboard: 'Una vista clara para tomar mejores decisiones con tu dinero.', movements: 'Revisa, filtra y organiza cada entrada y salida de dinero.', budgets: 'Define límites simples y sigue tu progreso por categoría.', wealth: 'Organiza tus cuentas, ahorros, inversiones y metas en un solo lugar.' })[view.value])
const periodLabel = computed(() => ({ week: 'Esta semana', month: 'Este mes', year: 'Este año', all: 'Todo el tiempo', custom: 'Período personalizado' })[selectedPeriod.value])
const displayedMovements = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('es')
  if (!query) return movements.value
  return movements.value.filter((movement) => [movement.description, labels[movement.type], movement.sourceAccount?.name, movement.destinationAccount?.name, labels[movement.paymentMethod], movement.destinationPaymentMethod && labels[movement.destinationPaymentMethod], movement.category && categoryLabel(movement.category.name)].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query))
})
const donutStyle = computed(() => {
  if (!categoryData.value.length) return { background: '#f0eef8' }
  let cursor = 0
  const stops = categoryData.value.map((category, index) => { const start = cursor; cursor += Number(category.percentage) || 0; return `${summaryCategoryColor(category, index)} ${start}% ${Math.min(cursor, 100)}%` })
  if (cursor < 100) stops.push(`#f0eef8 ${cursor}% 100%`)
  return { background: `conic-gradient(${stops.join(', ')})` }
})

function spentFor(budget: Budget) {
  return allMovements.value.filter((movement) => movement.type === 'EXPENSE' && movement.categoryId === budget.categoryId && new Date(movement.date) >= new Date(budget.startDate) && new Date(movement.date) <= new Date(budget.endDate)).reduce((total, movement) => total + Number(movement.amount), 0)
}
const budgetTotals = computed(() => budgets.value.reduce((total, budget) => { const amount = Number(budget.amount); const spent = spentFor(budget); total.planned += amount; total.spent += spent; total.available += Math.max(0, amount - spent); return total }, { planned: 0, spent: 0, available: 0 }))
const accountFlows = computed(() => accounts.value.slice().sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance))).slice(0, 3))

function formatDate(value: string) { return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)).replace('.', '') }
function formatMonth(value: string) { return new Intl.DateTimeFormat('es-PE', { month: 'short' }).format(new Date(`${value}-02T12:00:00`)).replace('.', '') }
function accountIcon(account: Pick<Account, 'type'>) { return account.type === 'CASH' ? '#icon-cash' : account.type === 'BANK' ? '#icon-bank' : account.type === 'SAVINGS' ? '#icon-piggy' : account.type === 'INVESTMENT' ? '#icon-trend' : '#icon-wallet' }
function movementAccountLabel(movement: Movement) {
  if (movement.type === 'INCOME') return movement.destinationAccount?.name || labels[movement.paymentMethod]
  if (movement.type === 'EXPENSE') return movement.sourceAccount?.name || labels[movement.paymentMethod]
  const source = movement.sourceAccount?.name || labels[movement.paymentMethod]
  const destination = movement.destinationAccount?.name || (movement.destinationPaymentMethod ? labels[movement.destinationPaymentMethod] : '')
  return `${source}${destination ? ` → ${destination}` : ''}`
}
function resetForm() {
  Object.assign(form, {
    id: '', type: 'EXPENSE', amount: '', description: '', date: today,
    paymentMethod: 'YAPE', destinationPaymentMethod: 'CASH', categoryId: '',
    sourceAccountId: accounts.value[0]?.id || '',
    destinationAccountId: accounts.value[1]?.id || accounts.value[0]?.id || ''
  })
}
function selectMovementType(type: MovementType) {
  form.type = type
  if (type === 'INCOME') { form.sourceAccountId = ''; if (!form.destinationAccountId) form.destinationAccountId = accounts.value[0]?.id || '' }
  if (type === 'EXPENSE') { form.destinationAccountId = ''; if (!form.sourceAccountId) form.sourceAccountId = accounts.value[0]?.id || '' }
  if (type === 'TRANSFER') { if (!form.sourceAccountId) form.sourceAccountId = accounts.value[0]?.id || ''; if (!form.destinationAccountId) form.destinationAccountId = accounts.value[1]?.id || '' }
  if (type === 'TRANSFER' && form.sourceAccountId === form.destinationAccountId) form.destinationAccountId = accounts.value.find((account) => account.id !== form.sourceAccountId)?.id || ''
}
function openMovement(type: MovementType = 'EXPENSE', movement?: Movement) {
  message.value = ''; resetForm()
  if (movement) Object.assign(form, { id: movement.id, type: movement.type, amount: String(movement.amount), description: movement.description || '', date: movement.date.slice(0, 10), paymentMethod: movement.paymentMethod, destinationPaymentMethod: movement.destinationPaymentMethod || 'CASH', categoryId: movement.categoryId || '', sourceAccountId: movement.sourceAccountId || '', destinationAccountId: movement.destinationAccountId || '' })
  else selectMovementType(type)
  composerOpen.value = true
}
function closeMovement() { composerOpen.value = false; resetForm() }

async function loadAll() {
  if (!session.value) return
  loading.value = true; message.value = ''
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
    const [movementResult, allResult, categoryResult, summaryResult, categorySummaryResult, evolutionResult, budgetResult, accountResult, goalResult] = await Promise.all([api.get('/movements', { params }), api.get('/movements'), api.get('/categories'), api.get('/dashboard/summary', { params }), api.get('/dashboard/categories', { params }), api.get('/dashboard/evolution'), api.get('/budgets'), api.get('/accounts'), api.get('/savings-goals')])
    movements.value = movementResult.data; allMovements.value = allResult.data; categories.value = categoryResult.data; summary.value = summaryResult.data; categoryData.value = categorySummaryResult.data; evolution.value = evolutionResult.data; budgets.value = budgetResult.data; accounts.value = accountResult.data; savingsGoals.value = goalResult.data
  } catch (error: any) { message.value = error.response?.data?.error || 'No pudimos cargar tus datos. Verifica que el servidor esté activo.' }
  finally { loading.value = false }
}
async function submitAuth() {
  busy.value = true; message.value = ''
  const result = authMode.value === 'login' ? await authService.signIn(auth.email, auth.password) : await authService.signUp(auth.email, auth.password)
  busy.value = false
  if (result.error) message.value = result.error.message
  else if (authMode.value === 'signup' && !result.data.session) message.value = 'Cuenta creada. Revisa tu correo para confirmarla.'
}
async function saveMovement() {
  busy.value = true; message.value = ''
  const payload: any = { type: form.type, amount: Number(form.amount), description: form.description || null, date: new Date(`${form.date}T12:00:00`).toISOString() }
  if (form.type === 'EXPENSE') payload.categoryId = form.categoryId
  if (accounts.value.length) {
    payload.sourceAccountId = form.type === 'INCOME' ? null : form.sourceAccountId
    payload.destinationAccountId = form.type === 'EXPENSE' ? null : form.destinationAccountId
  } else {
    payload.paymentMethod = form.paymentMethod
    if (form.type === 'TRANSFER') payload.destinationPaymentMethod = form.destinationPaymentMethod
  }
  try { form.id ? await api.patch(`/movements/${form.id}`, payload) : await api.post('/movements', payload); closeMovement(); await loadAll() }
  catch (error: any) { message.value = error.response?.data?.error || 'No se pudo guardar el movimiento.' }
  finally { busy.value = false }
}
async function removeMovement(id: string) {
  if (!confirm('¿Quieres eliminar este movimiento? Esta acción no se puede deshacer.')) return
  try { await api.delete(`/movements/${id}`); await loadAll() } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo eliminar el movimiento.' }
}
async function saveBudget() {
  busy.value = true; message.value = ''
  try { await api.post('/budgets', { amount: Number(budgetForm.amount), categoryId: budgetForm.categoryId, startDate: new Date(`${budgetForm.startDate}T12:00:00`).toISOString(), endDate: new Date(`${budgetForm.endDate}T12:00:00`).toISOString() }); Object.assign(budgetForm, { amount: '', categoryId: '', startDate: monthStart, endDate: monthEnd }); budgetComposerOpen.value = false; await loadAll() }
  catch (error: any) { message.value = error.response?.data?.error || 'No se pudo guardar el presupuesto.' }
  finally { busy.value = false }
}
async function removeBudget(id: string) {
  if (!confirm('¿Quieres eliminar este presupuesto?')) return
  try { await api.delete(`/budgets/${id}`); await loadAll() } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo eliminar el presupuesto.' }
}
async function saveAccount() {
  busy.value = true; message.value = ''
  try {
    await api.post('/accounts', {
      name: accountForm.name,
      type: accountForm.type,
      currency: accountForm.currency,
      initialBalance: Number(accountForm.initialBalance || 0),
      institution: accountForm.institution || null,
      lastFour: accountForm.lastFour || null,
      color: accountForm.color || null
    })
    Object.assign(accountForm, { name: '', type: 'BANK', currency: 'PEN', initialBalance: '', institution: '', lastFour: '', color: '#7257f5' })
    accountComposerOpen.value = false
    await loadAll()
  } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo crear la cuenta.' }
  finally { busy.value = false }
}
async function saveGoal() {
  busy.value = true; message.value = ''
  try {
    await api.post('/savings-goals', {
      name: goalForm.name,
      targetAmount: Number(goalForm.targetAmount),
      currentAmount: Number(goalForm.currentAmount || 0),
      accountId: goalForm.accountId || null,
      deadline: goalForm.deadline ? new Date(`${goalForm.deadline}T12:00:00`).toISOString() : null,
      color: goalForm.color || null
    })
    Object.assign(goalForm, { name: '', targetAmount: '', currentAmount: '', accountId: '', deadline: '', color: '#7257f5' })
    goalComposerOpen.value = false
    await loadAll()
  } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo crear la meta.' }
  finally { busy.value = false }
}
function openGoalProgress(goal: SavingsGoal) {
  Object.assign(progressForm, { goalId: goal.id, goalName: goal.name, currency: goal.account?.currency || 'PEN', operation: 'ADD', amount: '' })
  progressComposerOpen.value = true
}
async function saveGoalProgress() {
  busy.value = true; message.value = ''
  try {
    await api.post(`/savings-goals/${progressForm.goalId}/progress`, { operation: progressForm.operation, amount: Number(progressForm.amount) })
    progressComposerOpen.value = false
    await loadAll()
  } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo actualizar el progreso.' }
  finally { busy.value = false }
}
async function removeGoal(id: string) {
  if (!confirm('¿Quieres eliminar esta meta de ahorro?')) return
  try { await api.delete(`/savings-goals/${id}`); await loadAll() } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo eliminar la meta.' }
}
async function saveCategory() {
  busy.value = true; message.value = ''
  try {
    const result = await api.post('/categories', { name: categoryForm.name, color: categoryForm.color || null })
    categories.value.push(result.data)
    form.categoryId = result.data.id
    Object.assign(categoryForm, { name: '', color: '#7257f5' })
    categoryComposerOpen.value = false
  } catch (error: any) { message.value = error.response?.data?.error || 'No se pudo crear la categoría.' }
  finally { busy.value = false }
}
async function setPeriod(period: Exclude<Period, 'custom'>) {
  selectedPeriod.value = period; const base = new Date()
  if (period === 'week') { const day = base.getDay() || 7; const start = new Date(base); start.setDate(base.getDate() - day + 1); filters.startDate = toDateInput(start); filters.endDate = today }
  if (period === 'month') { filters.startDate = monthStart; filters.endDate = monthEnd }
  if (period === 'year') { filters.startDate = `${base.getFullYear()}-01-01`; filters.endDate = `${base.getFullYear()}-12-31` }
  if (period === 'all') { filters.startDate = ''; filters.endDate = '' }
  await loadAll()
}
async function applyCustomPeriod() { selectedPeriod.value = 'custom'; await loadAll() }
async function clearMovementFilters() { Object.assign(filters, { type: '', categoryId: '', accountId: '', paymentMethod: '', startDate: '', endDate: '' }); selectedPeriod.value = 'all'; searchQuery.value = ''; await loadAll() }
function navigate(nextView: View) { view.value = nextView; message.value = ''; window.scrollTo({ top: 0, behavior: 'smooth' }) }

onMounted(async () => {
  session.value = (await supabase.auth.getSession()).data.session
  supabase.auth.onAuthStateChange((_event, nextSession) => { session.value = nextSession; if (nextSession) loadAll() })
  await loadAll(); loading.value = false
})
</script>

<template>
  <div class="root-shell">
    <svg class="svg-defs" aria-hidden="true"><defs>
      <symbol id="icon-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></symbol>
      <symbol id="icon-swap" viewBox="0 0 24 24"><path d="M7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3"/></symbol>
      <symbol id="icon-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></symbol>
      <symbol id="icon-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
      <symbol id="icon-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></symbol>
      <symbol id="icon-wallet" viewBox="0 0 24 24"><path d="M4 6.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12v3.5"/><path d="M15 12h7v5h-7a2.5 2.5 0 0 1 0-5Z"/></symbol>
      <symbol id="icon-trend" viewBox="0 0 24 24"><path d="m3 17 6-6 4 4 7-8"/><path d="M15 7h5v5"/></symbol>
      <symbol id="icon-receipt" viewBox="0 0 24 24"><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8M8 12h6"/></symbol>
      <symbol id="icon-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></symbol>
      <symbol id="icon-edit" viewBox="0 0 24 24"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></symbol>
      <symbol id="icon-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></symbol>
      <symbol id="icon-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
      <symbol id="icon-logout" viewBox="0 0 24 24"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10"/></symbol>
      <symbol id="icon-arrow-up" viewBox="0 0 24 24"><path d="m6 10 6-6 6 6M12 4v16"/></symbol>
      <symbol id="icon-arrow-down" viewBox="0 0 24 24"><path d="m6 14 6 6 6-6M12 20V4"/></symbol>
      <symbol id="icon-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
      <symbol id="icon-bank" viewBox="0 0 24 24"><path d="m3 9 9-5 9 5M5 10v7M10 10v7M14 10v7M19 10v7M3 20h18"/></symbol>
      <symbol id="icon-cash" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9H5v2M17 15h2v-2"/></symbol>
      <symbol id="icon-piggy" viewBox="0 0 24 24"><path d="M5 11a7 7 0 0 1 13-2h3v6h-3a7 7 0 0 1-3 3v3h-3v-2H8v2H5v-4a6 6 0 0 1-2-4V9h3"/><path d="M14 8h.01M9 5c1-2 4-2 5 0"/></symbol>
      <symbol id="icon-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></symbol>
      <symbol id="icon-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
    </defs></svg>

    <main v-if="!session" class="auth-shell">
      <section class="auth-visual">
        <div class="auth-brand"><span class="brand-mark">N</span><strong>Norte</strong></div>
        <div class="auth-message"><span class="auth-kicker">FINANZAS, SIN COMPLICACIONES</span><h1>Haz que cada sol<br><em>tenga un propósito.</em></h1><p>Registra tus movimientos en segundos y entiende tus finanzas con una vista simple, honesta y clara.</p></div>
        <div class="auth-preview" aria-hidden="true"><div class="preview-top"><span>Balance del mes</span><i>•••</i></div><strong>S/ 4,820.00</strong><div class="preview-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="preview-caption"><span>Control diario</span><b>+12.4%</b></div></div>
      </section>
      <section class="auth-form-side">
        <form class="auth-card" @submit.prevent="submitAuth">
          <div class="mobile-auth-brand"><span class="brand-mark">N</span><strong>Norte</strong></div>
          <span class="section-tag">TU ESPACIO PERSONAL</span><h2>{{ authMode === 'login' ? 'Bienvenido de vuelta' : 'Empieza a ordenar tu dinero' }}</h2><p>{{ authMode === 'login' ? 'Ingresa y revisa cómo va tu mes.' : 'Crea tu cuenta y registra tu primer movimiento.' }}</p>
          <label><span>Correo electrónico</span><input v-model="auth.email" type="email" required autocomplete="email" placeholder="tu@correo.com"></label>
          <label><span>Contraseña</span><input v-model="auth.password" type="password" required minlength="6" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'" placeholder="Mínimo 6 caracteres"></label>
          <div v-if="message" class="notice" role="alert"><svg class="ui-icon"><use href="#icon-info"/></svg><span>{{ message }}</span></div>
          <button class="button button-primary auth-submit" :disabled="busy">{{ busy ? 'Procesando…' : authMode === 'login' ? 'Entrar a mi espacio' : 'Crear mi cuenta' }}<svg v-if="!busy" class="ui-icon"><use href="#icon-chevron"/></svg></button>
          <button type="button" class="text-button auth-switch" @click="authMode = authMode === 'login' ? 'signup' : 'login'; message = ''">{{ authMode === 'login' ? '¿Primera vez? Crea una cuenta' : 'Ya tengo una cuenta' }}</button>
        </form>
      </section>
    </main>

    <div v-else class="page-canvas">
      <div class="app-frame">
        <aside class="sidebar">
          <div class="sidebar-brand"><span class="brand-mark">N</span><strong>Norte</strong></div>
          <nav class="main-nav" aria-label="Navegación principal"><span class="nav-caption">MENÚ</span><button :class="{ active: view === 'dashboard' }" @click="navigate('dashboard')"><svg class="ui-icon"><use href="#icon-grid"/></svg><span>Resumen</span></button><button :class="{ active: view === 'movements' }" @click="navigate('movements')"><svg class="ui-icon"><use href="#icon-swap"/></svg><span>Movimientos</span></button><button :class="{ active: view === 'budgets' }" @click="navigate('budgets')"><svg class="ui-icon"><use href="#icon-target"/></svg><span>Presupuestos</span></button><button :class="{ active: view === 'wealth' }" @click="navigate('wealth')"><svg class="ui-icon"><use href="#icon-piggy"/></svg><span>Patrimonio</span></button></nav>
          <div class="sidebar-tip"><span class="tip-icon"><svg class="ui-icon"><use href="#icon-piggy"/></svg></span><strong>Pequeños registros,<br>grandes decisiones.</strong><p>Dedica un minuto al final de cada día.</p></div>
          <div class="sidebar-user"><span class="avatar">{{ userInitial }}</span><div><strong>{{ userName }}</strong><small>Cuenta personal</small></div><button title="Cerrar sesión" aria-label="Cerrar sesión" @click="authService.signOut()"><svg class="ui-icon"><use href="#icon-logout"/></svg></button></div>
        </aside>

        <main class="workspace">
          <header class="mobile-header"><div class="sidebar-brand"><span class="brand-mark">N</span><strong>Norte</strong></div><span class="avatar">{{ userInitial }}</span></header>
          <div class="content-wrap">
            <header class="page-header"><div><span class="section-tag">MI ESPACIO FINANCIERO</span><h1>{{ viewTitle }}</h1><p>{{ viewDescription }}</p></div><button v-if="view === 'dashboard' || view === 'movements'" class="button button-primary desktop-action" @click="openMovement('EXPENSE')"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nuevo movimiento</button><button v-else-if="view === 'budgets'" class="button button-primary desktop-action" @click="budgetComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nuevo presupuesto</button><button v-else class="button button-primary desktop-action" @click="accountComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nueva cuenta</button></header>
            <div v-if="message" class="notice app-notice" role="alert"><svg class="ui-icon"><use href="#icon-info"/></svg><span>{{ message }}</span><button aria-label="Cerrar aviso" @click="message = ''"><svg class="ui-icon"><use href="#icon-close"/></svg></button></div>
            <div v-if="loading" class="loading-state"><span class="loader"></span><strong>Preparando tus finanzas</strong><small>Solo tomará un momento.</small></div>

            <template v-else-if="view === 'dashboard'">
              <section class="toolbar period-toolbar" aria-label="Seleccionar período"><div class="period-presets"><button :class="{ active: selectedPeriod === 'week' }" @click="setPeriod('week')">Semana</button><button :class="{ active: selectedPeriod === 'month' }" @click="setPeriod('month')">Mes</button><button :class="{ active: selectedPeriod === 'year' }" @click="setPeriod('year')">Año</button><button :class="{ active: selectedPeriod === 'all' }" @click="setPeriod('all')">Todo</button></div><div class="date-range"><svg class="ui-icon"><use href="#icon-calendar"/></svg><input v-model="filters.startDate" type="date" aria-label="Fecha inicial"><span>—</span><input v-model="filters.endDate" type="date" aria-label="Fecha final"><button class="date-apply" @click="applyCustomPeriod">Aplicar</button></div></section>
              <section class="quick-capture"><div><span class="quick-icon"><svg class="ui-icon"><use href="#icon-receipt"/></svg></span><div><strong>¿Qué movimiento hiciste hoy?</strong><small>Regístralo ahora, te tomará menos de un minuto.</small></div></div><div class="quick-actions"><button class="quick-expense" @click="openMovement('EXPENSE')"><svg class="ui-icon"><use href="#icon-arrow-up"/></svg>Gasto</button><button class="quick-income" @click="openMovement('INCOME')"><svg class="ui-icon"><use href="#icon-arrow-down"/></svg>Ingreso</button><button @click="openMovement('TRANSFER')"><svg class="ui-icon"><use href="#icon-swap"/></svg>Transferencia</button></div></section>

              <section class="metric-grid">
                <article class="metric-card metric-featured"><div class="metric-heading"><span>Balance del período</span><span class="metric-icon"><svg class="ui-icon"><use href="#icon-wallet"/></svg></span></div><strong>{{ money(summary.balance) }}</strong><small>{{ periodLabel }} · disponible después de gastos</small></article>
                <article class="metric-card"><div class="metric-heading"><span>Ingresos</span><span class="metric-trend positive"><svg class="ui-icon"><use href="#icon-arrow-down"/></svg></span></div><strong>{{ money(summary.income) }}</strong><small class="positive-text">Entradas registradas</small></article>
                <article class="metric-card"><div class="metric-heading"><span>Gastos</span><span class="metric-trend negative"><svg class="ui-icon"><use href="#icon-arrow-up"/></svg></span></div><strong>{{ money(summary.expenses) }}</strong><small class="negative-text">{{ Number(summary.expensePercentage || 0).toFixed(0) }}% de tus ingresos</small></article>
                <article class="metric-card"><div class="metric-heading"><span>Tasa de ahorro</span><span class="metric-icon soft"><svg class="ui-icon"><use href="#icon-piggy"/></svg></span></div><strong>{{ savingsRate.toFixed(0) }}%</strong><small>Ingreso que no se gastó</small></article>
              </section>

              <section class="dashboard-grid">
                <article class="card chart-card span-two"><div class="card-heading"><div><span class="card-kicker">TENDENCIA</span><h2>Flujo de dinero</h2></div><div class="chart-legend"><span><i class="legend-income"></i>Ingresos</span><span><i class="legend-expense"></i>Gastos</span></div></div><div v-if="!chartRows.length" class="empty-state compact-empty"><span class="empty-icon"><svg class="ui-icon"><use href="#icon-trend"/></svg></span><strong>Aún no hay una tendencia</strong><small>Registra movimientos para verla aquí.</small></div><div v-else class="bar-chart"><div v-for="row in chartRows" :key="row.month" class="bar-column"><div class="bar-values"><span>{{ compactMoney(row.income) }}</span><span>{{ compactMoney(row.expenses) }}</span></div><div class="bars"><i class="income-bar" :style="{ height: `${Math.max(5, row.income / monthMax * 156)}px` }"></i><i class="expense-bar" :style="{ height: `${Math.max(5, row.expenses / monthMax * 156)}px` }"></i></div><small>{{ formatMonth(row.month) }}</small></div></div></article>
                <article class="card category-card"><div class="card-heading"><div><span class="card-kicker">DISTRIBUCIÓN</span><h2>Gastos por categoría</h2></div></div><div v-if="!categoryData.length" class="empty-state compact-empty"><span class="empty-icon"><svg class="ui-icon"><use href="#icon-target"/></svg></span><strong>Sin gastos en este período</strong><small>Eso suena bastante bien.</small></div><template v-else><div class="donut-wrap"><div class="donut" :style="donutStyle"><div><small>Total gastado</small><strong>{{ compactMoney(summary.expenses) }}</strong></div></div></div><div class="category-list"><div v-for="(category, index) in categoryData.slice(0, 5)" :key="category.category" class="category-item"><i :style="{ background: categoryColor(index) }"></i><span>{{ categoryLabel(category.category) }}</span><b>{{ money(category.amount) }}</b><small>{{ Number(category.percentage).toFixed(0) }}%</small></div></div></template></article>
                <article class="card recent-card span-two"><div class="card-heading"><div><span class="card-kicker">ACTIVIDAD</span><h2>Movimientos recientes</h2></div><button class="text-button" @click="navigate('movements')">Ver todos <svg class="ui-icon"><use href="#icon-chevron"/></svg></button></div><div v-if="!movements.length" class="empty-state"><span class="empty-icon"><svg class="ui-icon"><use href="#icon-receipt"/></svg></span><strong>Tu historial empieza aquí</strong><small>Registra el primer movimiento de tu día.</small><button class="button button-soft" @click="openMovement('EXPENSE')"><svg class="ui-icon"><use href="#icon-plus"/></svg>Registrar movimiento</button></div><div v-else class="transaction-list"><div v-for="movement in movements.slice(0, 5)" :key="movement.id" class="transaction-row"><span class="transaction-icon" :class="movement.type"><svg class="ui-icon"><use :href="movement.type === 'INCOME' ? '#icon-arrow-down' : movement.type === 'EXPENSE' ? '#icon-arrow-up' : '#icon-swap'"/></svg></span><div class="transaction-name"><strong>{{ movement.description || labels[movement.type] }}</strong><small>{{ categoryLabel(movement.category?.name) }} · {{ movementAccountLabel(movement) }}</small></div><time>{{ formatDate(movement.date) }}</time><strong class="transaction-amount" :class="movement.type">{{ movement.type === 'EXPENSE' ? '−' : movement.type === 'INCOME' ? '+' : '' }}{{ money(movement.amount) }}</strong></div></div></article>
                <div class="side-stack">
                  <article class="card compact-card"><div class="card-heading"><div><span class="card-kicker">CONTROL</span><h2>Presupuestos</h2></div><button class="round-link" aria-label="Ver presupuestos" @click="navigate('budgets')"><svg class="ui-icon"><use href="#icon-chevron"/></svg></button></div><template v-if="budgets.length"><div class="budget-mini-summary"><strong>{{ money(budgetTotals.available) }}</strong><small>disponible de {{ money(budgetTotals.planned) }}</small></div><div class="progress-track large"><i :style="{ width: `${Math.min(100, budgetTotals.spent / Math.max(1, budgetTotals.planned) * 100)}%` }"></i></div><div class="budget-caption"><span>{{ money(budgetTotals.spent) }} usado</span><b>{{ Math.min(100, budgetTotals.spent / Math.max(1, budgetTotals.planned) * 100).toFixed(0) }}%</b></div></template><div v-else class="mini-empty"><span>Sin presupuestos activos.</span><button class="text-button" @click="budgetComposerOpen = true">Crear uno</button></div></article>
                  <article class="card compact-card account-card"><div class="card-heading"><div><span class="card-kicker">PATRIMONIO</span><h2>Tus cuentas</h2></div><button class="round-link" aria-label="Ver patrimonio" @click="navigate('wealth')"><svg class="ui-icon"><use href="#icon-chevron"/></svg></button></div><div class="account-list"><div v-for="account in accountFlows" :key="account.id"><span class="account-icon" :style="{ color: account.color || '#7257f5', background: `${account.color || '#7257f5'}12` }"><svg class="ui-icon"><use :href="accountIcon(account)"/></svg></span><span>{{ account.name }}</span><strong :class="{ negativeValue: account.balance < 0 }">{{ accountMoney(account.balance, account.currency) }}</strong></div><div v-if="!accountFlows.length" class="mini-empty"><span>Aún no tienes cuentas.</span><button class="text-button" @click="accountComposerOpen = true">Crear una</button></div></div></article>
                </div>
              </section>
            </template>

            <template v-else-if="view === 'movements'">
              <section class="movement-summary metric-grid compact-metrics"><article class="metric-card"><div class="metric-heading"><span>Ingresos del filtro</span><span class="metric-trend positive"><svg class="ui-icon"><use href="#icon-arrow-down"/></svg></span></div><strong>{{ money(summary.income) }}</strong></article><article class="metric-card"><div class="metric-heading"><span>Gastos del filtro</span><span class="metric-trend negative"><svg class="ui-icon"><use href="#icon-arrow-up"/></svg></span></div><strong>{{ money(summary.expenses) }}</strong></article><article class="metric-card"><div class="metric-heading"><span>Resultado</span><span class="metric-icon soft"><svg class="ui-icon"><use href="#icon-wallet"/></svg></span></div><strong>{{ money(summary.balance) }}</strong></article></section>
              <section class="card filter-card"><div class="search-field"><svg class="ui-icon"><use href="#icon-search"/></svg><input v-model="searchQuery" type="search" placeholder="Buscar por descripción, categoría o cuenta"></div><select v-model="filters.type" @change="loadAll"><option value="">Todos los tipos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Gastos</option><option value="TRANSFER">Transferencias</option></select><select v-if="accounts.length" v-model="filters.accountId" @change="loadAll"><option value="">Todas las cuentas</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option></select><select v-else v-model="filters.paymentMethod" @change="loadAll"><option value="">Todos los medios</option><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="BANK_TRANSFER">Banco</option></select><input v-model="filters.startDate" type="date" aria-label="Desde" @change="applyCustomPeriod"><input v-model="filters.endDate" type="date" aria-label="Hasta" @change="applyCustomPeriod"><button class="clear-filter" @click="clearMovementFilters">Limpiar</button></section>
              <section class="card movement-table-card"><div class="list-heading"><div><h2>Historial</h2><span>{{ displayedMovements.length }} {{ displayedMovements.length === 1 ? 'movimiento' : 'movimientos' }}</span></div></div><div v-if="!displayedMovements.length" class="empty-state"><span class="empty-icon"><svg class="ui-icon"><use href="#icon-search"/></svg></span><strong>No encontramos movimientos</strong><small>Prueba con otros filtros o registra uno nuevo.</small><button class="button button-soft" @click="openMovement('EXPENSE')"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nuevo movimiento</button></div><div v-else class="movement-table"><div class="table-head"><span>Movimiento</span><span>Fecha</span><span>Cuenta</span><span>Monto</span><span></span></div><div v-for="movement in displayedMovements" :key="movement.id" class="movement-table-row"><div class="transaction-name-cell"><span class="transaction-icon" :class="movement.type"><svg class="ui-icon"><use :href="movement.type === 'INCOME' ? '#icon-arrow-down' : movement.type === 'EXPENSE' ? '#icon-arrow-up' : '#icon-swap'"/></svg></span><div><strong>{{ movement.description || labels[movement.type] }}</strong><small>{{ movement.category ? categoryLabel(movement.category.name) : labels[movement.type] }}</small></div></div><time data-label="Fecha">{{ formatDate(movement.date) }}</time><div class="payment-cell" data-label="Cuenta"><span>{{ movementAccountLabel(movement) }}</span></div><strong class="transaction-amount" :class="movement.type" data-label="Monto">{{ movement.type === 'EXPENSE' ? '−' : movement.type === 'INCOME' ? '+' : '' }}{{ money(movement.amount) }}</strong><div class="row-actions"><button title="Editar" aria-label="Editar movimiento" @click="openMovement(movement.type, movement)"><svg class="ui-icon"><use href="#icon-edit"/></svg></button><button class="danger-action" title="Eliminar" aria-label="Eliminar movimiento" @click="removeMovement(movement.id)"><svg class="ui-icon"><use href="#icon-trash"/></svg></button></div></div></div></section>
            </template>

            <template v-else-if="view === 'budgets'">
              <section class="budget-overview metric-grid compact-metrics"><article class="metric-card metric-featured"><div class="metric-heading"><span>Total planificado</span><span class="metric-icon"><svg class="ui-icon"><use href="#icon-target"/></svg></span></div><strong>{{ money(budgetTotals.planned) }}</strong><small>{{ budgets.length }} {{ budgets.length === 1 ? 'categoría' : 'categorías' }} bajo control</small></article><article class="metric-card"><div class="metric-heading"><span>Utilizado</span><span class="metric-trend negative"><svg class="ui-icon"><use href="#icon-arrow-up"/></svg></span></div><strong>{{ money(budgetTotals.spent) }}</strong><small>{{ Math.min(100, budgetTotals.spent / Math.max(1, budgetTotals.planned) * 100).toFixed(0) }}% del total</small></article><article class="metric-card"><div class="metric-heading"><span>Disponible</span><span class="metric-trend positive"><svg class="ui-icon"><use href="#icon-check"/></svg></span></div><strong>{{ money(budgetTotals.available) }}</strong><small>Para lo que queda del período</small></article></section>
              <section v-if="budgets.length" class="budget-grid"><article v-for="(budget, index) in budgets" :key="budget.id" class="card budget-card"><div class="budget-top"><span class="budget-category-icon" :style="{ background: `${categoryColor(index)}18`, color: categoryColor(index) }"><svg class="ui-icon"><use href="#icon-target"/></svg></span><div><span class="card-kicker">PRESUPUESTO</span><h2>{{ categoryLabel(budget.category?.name || categories.find((category) => category.id === budget.categoryId)?.name) }}</h2></div><button class="danger-action" title="Eliminar" aria-label="Eliminar presupuesto" @click="removeBudget(budget.id)"><svg class="ui-icon"><use href="#icon-trash"/></svg></button></div><div class="budget-amounts"><div><small>Utilizado</small><strong>{{ money(spentFor(budget)) }}</strong></div><div><small>Disponible</small><strong>{{ money(Math.max(0, Number(budget.amount) - spentFor(budget))) }}</strong></div></div><div class="progress-track large"><i :style="{ background: categoryColor(index), width: `${Math.min(100, spentFor(budget) / Math.max(1, Number(budget.amount)) * 100)}%` }"></i></div><div class="budget-caption"><span>{{ formatDate(budget.startDate) }} — {{ formatDate(budget.endDate) }}</span><b>{{ Math.min(100, spentFor(budget) / Math.max(1, Number(budget.amount)) * 100).toFixed(0) }}%</b></div></article></section>
              <section v-else class="card budget-empty"><div class="budget-empty-visual"><span><svg class="ui-icon"><use href="#icon-target"/></svg></span><i></i><i></i><i></i></div><span class="section-tag">EMPIEZA CON UNA CATEGORÍA</span><h2>Un presupuesto es un plan,<br>no una restricción.</h2><p>Define cuánto quieres destinar a comida, transporte o entretenimiento y nosotros te mostramos el avance.</p><button class="button button-primary" @click="budgetComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Crear mi primer presupuesto</button></section>
            </template>

            <template v-else>
              <section class="wealth-metrics metric-grid">
                <article class="metric-card metric-featured"><div class="metric-heading"><span>Patrimonio en soles</span><span class="metric-icon"><svg class="ui-icon"><use href="#icon-wallet"/></svg></span></div><strong>{{ money(penNetWorth) }}</strong><small>Saldo total entre tus cuentas PEN</small></article>
                <article class="metric-card"><div class="metric-heading"><span>Patrimonio en dólares</span><span class="metric-icon soft"><svg class="ui-icon"><use href="#icon-bank"/></svg></span></div><strong>{{ accountMoney(usdNetWorth, 'USD') }}</strong><small>Saldo total entre tus cuentas USD</small></article>
                <article class="metric-card"><div class="metric-heading"><span>Ahorros e inversiones</span><span class="metric-trend positive"><svg class="ui-icon"><use href="#icon-trend"/></svg></span></div><strong>{{ money(savingsBalance) }}</strong><small>Capital reservado en soles</small></article>
                <article class="metric-card"><div class="metric-heading"><span>Progreso de metas</span><span class="metric-icon soft"><svg class="ui-icon"><use href="#icon-target"/></svg></span></div><strong>{{ money(goalTotals.current) }}</strong><small>de {{ money(goalTotals.target) }} planificado</small></article>
              </section>

              <section class="wealth-actions">
                <button class="button button-soft" @click="accountComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nueva cuenta</button>
                <button class="button button-secondary" @click="goalComposerOpen = true"><svg class="ui-icon"><use href="#icon-target"/></svg>Nueva meta</button>
              </section>

              <section class="wealth-section">
                <div class="section-heading"><div><span class="card-kicker">TU DINERO</span><h2>Cuentas y activos</h2><p>Los saldos se actualizan automáticamente con cada movimiento.</p></div><button class="text-button" @click="accountComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Agregar cuenta</button></div>
                <div class="wealth-account-grid">
                  <article v-for="account in accounts" :key="account.id" class="card wealth-account" :style="{ '--account-color': account.color || '#7257f5' }">
                    <div class="wealth-account-top"><span class="wealth-account-icon"><svg class="ui-icon"><use :href="accountIcon(account)"/></svg></span><div><span>{{ accountTypeLabels[account.type] }}</span><strong>{{ account.name }}</strong></div><span class="currency-badge">{{ account.currency }}</span></div>
                    <strong class="wealth-balance" :class="{ negativeValue: account.balance < 0 }">{{ accountMoney(account.balance, account.currency) }}</strong>
                    <small v-if="account.institution || account.lastFour" class="account-detail">{{ account.institution || 'Cuenta' }}<template v-if="account.lastFour"> · •••• {{ account.lastFour }}</template></small>
                    <div class="account-movements"><span><i>Entradas</i><b>+{{ accountMoney(account.incoming, account.currency) }}</b></span><span><i>Salidas</i><b>−{{ accountMoney(account.outgoing, account.currency) }}</b></span></div>
                  </article>
                  <button class="add-wealth-card" @click="accountComposerOpen = true"><span><svg class="ui-icon"><use href="#icon-plus"/></svg></span><strong>Agregar otra cuenta</strong><small>Banco, billetera, ahorro o inversión</small></button>
                </div>
              </section>

              <section class="wealth-section goals-section">
                <div class="section-heading"><div><span class="card-kicker">TUS OBJETIVOS</span><h2>Metas de ahorro</h2><p>Convierte una intención en un progreso visible.</p></div><button class="text-button" @click="goalComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nueva meta</button></div>
                <div v-if="savingsGoals.length" class="goal-grid">
                  <article v-for="goal in savingsGoals" :key="goal.id" class="card goal-card" :style="{ '--goal-color': goal.color || '#7257f5' }">
                    <div class="goal-top"><span class="goal-icon"><svg class="ui-icon"><use href="#icon-target"/></svg></span><div><strong>{{ goal.name }}</strong><small>{{ goal.account?.name || 'Meta independiente' }}</small></div><span class="goal-status" :class="goal.status.toLowerCase()">{{ goalStatusLabels[goal.status] }}</span></div>
                    <div class="goal-numbers"><strong>{{ accountMoney(goal.currentAmount, goal.account?.currency || 'PEN') }}</strong><span>de {{ accountMoney(goal.targetAmount, goal.account?.currency || 'PEN') }}</span></div>
                    <div class="progress-track large"><i :style="{ background: goal.color || '#7257f5', width: `${Math.min(100, goal.percentage)}%` }"></i></div>
                    <div class="goal-caption"><span>{{ Math.min(100, Number(goal.percentage)).toFixed(0) }}% completado</span><span v-if="goal.deadline">Hasta {{ formatDate(goal.deadline) }}</span><span v-else>Sin fecha límite</span></div>
                    <div class="goal-actions"><button class="button button-soft" :disabled="goal.status === 'CANCELLED'" @click="openGoalProgress(goal)"><svg class="ui-icon"><use href="#icon-plus"/></svg>Registrar progreso</button><button class="danger-action" title="Eliminar meta" aria-label="Eliminar meta" @click="removeGoal(goal.id)"><svg class="ui-icon"><use href="#icon-trash"/></svg></button></div>
                  </article>
                </div>
                <div v-else class="card goals-empty"><span class="empty-icon"><svg class="ui-icon"><use href="#icon-piggy"/></svg></span><div><strong>¿Qué quieres lograr?</strong><small>Un fondo de emergencia, un viaje o tu próxima inversión.</small></div><button class="button button-soft" @click="goalComposerOpen = true">Crear una meta</button></div>
              </section>

              <section class="card categories-manager">
                <div><span class="category-manager-icon"><svg class="ui-icon"><use href="#icon-grid"/></svg></span><div><strong>Categorías personalizadas</strong><small>Adapta el registro de gastos a tu propia forma de organizarte.</small></div></div>
                <div class="custom-category-list"><span v-for="category in categories.filter((item) => item.isSystem === false)" :key="category.id"><i :style="{ background: category.color || '#7257f5' }"></i>{{ category.name }}</span></div>
                <button class="button button-secondary" @click="categoryComposerOpen = true"><svg class="ui-icon"><use href="#icon-plus"/></svg>Nueva categoría</button>
              </section>
            </template>
          </div>
        </main>
      </div>
      <nav class="mobile-nav" aria-label="Navegación móvil"><button :class="{ active: view === 'dashboard' }" @click="navigate('dashboard')"><svg class="ui-icon"><use href="#icon-grid"/></svg><span>Resumen</span></button><button :class="{ active: view === 'movements' }" @click="navigate('movements')"><svg class="ui-icon"><use href="#icon-swap"/></svg><span>Movimientos</span></button><button :class="{ active: view === 'budgets' }" @click="navigate('budgets')"><svg class="ui-icon"><use href="#icon-target"/></svg><span>Presupuestos</span></button><button :class="{ active: view === 'wealth' }" @click="navigate('wealth')"><svg class="ui-icon"><use href="#icon-piggy"/></svg><span>Patrimonio</span></button></nav>
      <button class="mobile-fab" aria-label="Crear nuevo" @click="view === 'budgets' ? budgetComposerOpen = true : view === 'wealth' ? accountComposerOpen = true : openMovement('EXPENSE')"><svg class="ui-icon"><use href="#icon-plus"/></svg></button>
    </div>

    <div v-if="composerOpen" class="modal-backdrop" @click.self="closeMovement">
      <section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="movement-modal-title">
        <header class="modal-header"><div><span class="section-tag">REGISTRO RÁPIDO</span><h2 id="movement-modal-title">{{ form.id ? 'Editar movimiento' : 'Nuevo movimiento' }}</h2><p>{{ form.id ? 'Actualiza la información que necesites.' : 'Añade lo que pasó con tu dinero hoy.' }}</p></div><button class="modal-close" aria-label="Cerrar" @click="closeMovement"><svg class="ui-icon"><use href="#icon-close"/></svg></button></header>
        <form @submit.prevent="saveMovement">
          <fieldset class="type-selector"><legend>Tipo de movimiento</legend><button type="button" :class="{ active: form.type === 'EXPENSE' }" @click="selectMovementType('EXPENSE')"><span class="selector-icon expense"><svg class="ui-icon"><use href="#icon-arrow-up"/></svg></span><span><strong>Gasto</strong><small>Dinero que salió</small></span></button><button type="button" :class="{ active: form.type === 'INCOME' }" @click="selectMovementType('INCOME')"><span class="selector-icon income"><svg class="ui-icon"><use href="#icon-arrow-down"/></svg></span><span><strong>Ingreso</strong><small>Dinero que entró</small></span></button><button type="button" :class="{ active: form.type === 'TRANSFER' }" @click="selectMovementType('TRANSFER')"><span class="selector-icon transfer"><svg class="ui-icon"><use href="#icon-swap"/></svg></span><span><strong>Transferencia</strong><small>Entre tus cuentas</small></span></button></fieldset>
          <div class="form-grid"><label class="amount-field"><span>Monto</span><div><b>{{ accounts.find((account) => account.id === (form.sourceAccountId || form.destinationAccountId))?.currency === 'USD' ? '$' : 'S/' }}</b><input v-model="form.amount" type="number" min="0.01" step="0.01" inputmode="decimal" required autofocus placeholder="0.00"></div></label><label><span>Fecha</span><input v-model="form.date" type="date" required></label><template v-if="accounts.length"><label v-if="form.type !== 'INCOME'"><span>{{ form.type === 'TRANSFER' ? 'Desde la cuenta' : 'Pagar desde' }}</span><select v-model="form.sourceAccountId" required><option value="" disabled>Selecciona una cuenta</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }} · {{ accountMoney(account.balance, account.currency) }}</option></select></label><label v-if="form.type !== 'EXPENSE'"><span>{{ form.type === 'TRANSFER' ? 'Hacia la cuenta' : 'Depositar en' }}</span><select v-model="form.destinationAccountId" required><option value="" disabled>Selecciona una cuenta</option><option v-for="account in (form.type === 'TRANSFER' ? transferDestinationAccounts : accounts)" :key="account.id" :value="account.id">{{ account.name }} · {{ accountMoney(account.balance, account.currency) }}</option></select></label></template><template v-else><label><span>{{ form.type === 'TRANSFER' ? 'Desde' : 'Medio de pago' }}</span><select v-model="form.paymentMethod"><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="BANK_TRANSFER">Banco</option></select></label><label v-if="form.type === 'TRANSFER'"><span>Hacia</span><select v-model="form.destinationPaymentMethod"><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="BANK_TRANSFER">Banco</option></select></label></template><label v-if="form.type === 'EXPENSE'"><span>Categoría <button type="button" class="inline-create" @click="categoryComposerOpen = true">+ Crear nueva</button></span><select v-model="form.categoryId" required><option value="" disabled>Selecciona una categoría</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ categoryLabel(category.name) }}</option></select></label><label class="wide-field"><span>Descripción <i>(opcional)</i></span><input v-model="form.description" maxlength="255" :placeholder="form.type === 'EXPENSE' ? 'Ej. Almuerzo, taxi, supermercado' : form.type === 'INCOME' ? 'Ej. Sueldo, venta, devolución' : 'Ej. De ahorros a cuenta bancaria'"></label></div>
          <div v-if="movementAccountsInvalid && form.type === 'TRANSFER'" class="inline-warning"><svg class="ui-icon"><use href="#icon-info"/></svg>Elige dos cuentas distintas y de la misma moneda.</div>
          <footer class="modal-footer"><button type="button" class="button button-secondary" @click="closeMovement">Cancelar</button><button class="button button-primary" :disabled="busy || movementAccountsInvalid">{{ busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Registrar movimiento' }}</button></footer>
        </form>
      </section>
    </div>

    <div v-if="budgetComposerOpen" class="modal-backdrop" @click.self="budgetComposerOpen = false">
      <section class="modal-sheet budget-modal" role="dialog" aria-modal="true" aria-labelledby="budget-modal-title">
        <header class="modal-header"><div><span class="section-tag">PLAN DEL MES</span><h2 id="budget-modal-title">Nuevo presupuesto</h2><p>Define un límite para una categoría y período.</p></div><button class="modal-close" aria-label="Cerrar" @click="budgetComposerOpen = false"><svg class="ui-icon"><use href="#icon-close"/></svg></button></header>
        <form @submit.prevent="saveBudget"><div class="form-grid"><label class="wide-field"><span>Categoría</span><select v-model="budgetForm.categoryId" required><option value="" disabled>Selecciona una categoría</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ categoryLabel(category.name) }}</option></select></label><label class="amount-field wide-field"><span>Monto máximo</span><div><b>S/</b><input v-model="budgetForm.amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00"></div></label><label><span>Desde</span><input v-model="budgetForm.startDate" type="date" required></label><label><span>Hasta</span><input v-model="budgetForm.endDate" type="date" required></label></div><footer class="modal-footer"><button type="button" class="button button-secondary" @click="budgetComposerOpen = false">Cancelar</button><button class="button button-primary" :disabled="busy">{{ busy ? 'Guardando…' : 'Crear presupuesto' }}</button></footer></form>
      </section>
    </div>

    <div v-if="accountComposerOpen" class="modal-backdrop" @click.self="accountComposerOpen = false">
      <section class="modal-sheet budget-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
        <header class="modal-header"><div><span class="section-tag">NUEVO ACTIVO</span><h2 id="account-modal-title">Crear una cuenta</h2><p>Puede ser efectivo, banco, billetera, ahorro o inversión.</p></div><button class="modal-close" aria-label="Cerrar" @click="accountComposerOpen = false"><svg class="ui-icon"><use href="#icon-close"/></svg></button></header>
        <form @submit.prevent="saveAccount">
          <div class="form-grid">
            <label class="wide-field"><span>Nombre de la cuenta</span><input v-model="accountForm.name" required minlength="2" maxlength="80" placeholder="Ej. BCP Ahorros, Yape personal"></label>
            <label><span>Tipo</span><select v-model="accountForm.type"><option v-for="(label, type) in accountTypeLabels" :key="type" :value="type">{{ label }}</option></select></label>
            <label><span>Moneda</span><select v-model="accountForm.currency"><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></label>
            <label class="amount-field"><span>Saldo inicial</span><div><b>{{ accountForm.currency === 'USD' ? '$' : 'S/' }}</b><input v-model="accountForm.initialBalance" type="number" step="0.01" inputmode="decimal" placeholder="0.00"></div></label>
            <label><span>Institución <i>(opcional)</i></span><input v-model="accountForm.institution" maxlength="80" placeholder="Ej. BCP, Interbank"></label>
            <label><span>Últimos 4 dígitos <i>(opcional)</i></span><input v-model="accountForm.lastFour" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="1234"></label>
            <label class="color-field"><span>Color</span><input v-model="accountForm.color" type="color"></label>
          </div>
          <footer class="modal-footer"><button type="button" class="button button-secondary" @click="accountComposerOpen = false">Cancelar</button><button class="button button-primary" :disabled="busy">{{ busy ? 'Creando…' : 'Crear cuenta' }}</button></footer>
        </form>
      </section>
    </div>

    <div v-if="goalComposerOpen" class="modal-backdrop" @click.self="goalComposerOpen = false">
      <section class="modal-sheet budget-modal" role="dialog" aria-modal="true" aria-labelledby="goal-modal-title">
        <header class="modal-header"><div><span class="section-tag">NUEVO OBJETIVO</span><h2 id="goal-modal-title">Crear una meta</h2><p>Haz visible aquello para lo que estás ahorrando.</p></div><button class="modal-close" aria-label="Cerrar" @click="goalComposerOpen = false"><svg class="ui-icon"><use href="#icon-close"/></svg></button></header>
        <form @submit.prevent="saveGoal">
          <div class="form-grid">
            <label class="wide-field"><span>Nombre de la meta</span><input v-model="goalForm.name" required minlength="2" maxlength="100" placeholder="Ej. Fondo de emergencia, nuevo laptop"></label>
            <label class="amount-field"><span>Monto objetivo</span><div><b>{{ goalCurrency === 'USD' ? '$' : 'S/' }}</b><input v-model="goalForm.targetAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00"></div></label>
            <label class="amount-field"><span>Ya tengo ahorrado</span><div><b>{{ goalCurrency === 'USD' ? '$' : 'S/' }}</b><input v-model="goalForm.currentAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div></label>
            <label class="wide-field"><span>Vincular a una cuenta <i>(opcional)</i></span><select v-model="goalForm.accountId"><option value="">Sin cuenta vinculada</option><option v-for="account in savingsAccounts" :key="account.id" :value="account.id">{{ account.name }} · {{ accountMoney(account.balance, account.currency) }}</option></select><small v-if="!savingsAccounts.length" class="field-help">Crea una cuenta de ahorro o inversión para poder vincularla.</small></label>
            <label><span>Fecha objetivo <i>(opcional)</i></span><input v-model="goalForm.deadline" type="date" :min="today"></label>
            <label class="color-field"><span>Color</span><input v-model="goalForm.color" type="color"></label>
          </div>
          <footer class="modal-footer"><button type="button" class="button button-secondary" @click="goalComposerOpen = false">Cancelar</button><button class="button button-primary" :disabled="busy">{{ busy ? 'Creando…' : 'Crear meta' }}</button></footer>
        </form>
      </section>
    </div>

    <div v-if="progressComposerOpen" class="modal-backdrop" @click.self="progressComposerOpen = false">
      <section class="modal-sheet progress-modal" role="dialog" aria-modal="true" aria-labelledby="progress-modal-title">
        <header class="modal-header"><div><span class="section-tag">ACTUALIZAR AHORRO</span><h2 id="progress-modal-title">{{ progressForm.goalName }}</h2><p>Registra cuánto avanzaste hacia tu objetivo.</p></div><button class="modal-close" aria-label="Cerrar" @click="progressComposerOpen = false"><svg class="ui-icon"><use href="#icon-close"/></svg></button></header>
        <form @submit.prevent="saveGoalProgress">
          <fieldset class="progress-operation"><legend>¿Qué quieres hacer?</legend><button type="button" :class="{ active: progressForm.operation === 'ADD' }" @click="progressForm.operation = 'ADD'">Sumar</button><button type="button" :class="{ active: progressForm.operation === 'SUBTRACT' }" @click="progressForm.operation = 'SUBTRACT'">Restar</button><button type="button" :class="{ active: progressForm.operation === 'SET' }" @click="progressForm.operation = 'SET'">Fijar total</button></fieldset>
          <div class="form-grid"><label class="amount-field wide-field"><span>Monto</span><div><b>{{ progressForm.currency === 'USD' ? '$' : 'S/' }}</b><input v-model="progressForm.amount" type="number" min="0" step="0.01" inputmode="decimal" required autofocus placeholder="0.00"></div></label></div>
          <footer class="modal-footer"><button type="button" class="button button-secondary" @click="progressComposerOpen = false">Cancelar</button><button class="button button-primary" :disabled="busy">{{ busy ? 'Actualizando…' : 'Guardar progreso' }}</button></footer>
        </form>
      </section>
    </div>

    <div v-if="categoryComposerOpen" class="modal-backdrop nested-modal" @click.self="categoryComposerOpen = false">
      <section class="modal-sheet progress-modal" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <header class="modal-header"><div><span class="section-tag">ORGANIZA A TU MANERA</span><h2 id="category-modal-title">Nueva categoría</h2><p>Se mostrará al registrar gastos y crear presupuestos.</p></div><button class="modal-close" aria-label="Cerrar" @click="categoryComposerOpen = false"><svg class="ui-icon"><use href="#icon-close"/></svg></button></header>
        <form @submit.prevent="saveCategory"><div class="form-grid"><label class="wide-field"><span>Nombre</span><input v-model="categoryForm.name" required minlength="2" maxlength="80" placeholder="Ej. Mascotas, Salud, Suscripciones"></label><label class="color-field wide-field"><span>Color</span><input v-model="categoryForm.color" type="color"></label></div><footer class="modal-footer"><button type="button" class="button button-secondary" @click="categoryComposerOpen = false">Cancelar</button><button class="button button-primary" :disabled="busy">{{ busy ? 'Creando…' : 'Crear categoría' }}</button></footer></form>
      </section>
    </div>
  </div>
</template>
