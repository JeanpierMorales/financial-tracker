<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './config/supabase'
import { authService } from './services/auth.service'
import { api } from './services/api'
import type { Category } from './types/category'
import type { Movement, MovementType, PaymentMethod } from './types/movement'
import type { CategorySummary, Evolution, Summary } from './types/dashboard'

type View = 'dashboard' | 'movements' | 'budgets'
interface Budget { id: string; amount: string | number; startDate: string; endDate: string }

const session = ref<Session | null>(null), loading = ref(true), busy = ref(false)
const view = ref<View>('dashboard'), authMode = ref<'login' | 'signup'>('login')
const auth = reactive({ email: '', password: '' }), message = ref('')
const movements = ref<Movement[]>([]), allMovements = ref<Movement[]>([]), categories = ref<Category[]>([]), budgets = ref<Budget[]>([])
const summary = ref<Summary>({ income: 0, expenses: 0, balance: 0, dailyAverage: 0, expensePercentage: 0 })
const categoryData = ref<CategorySummary[]>([]), evolution = ref<Evolution[]>([])
const filters = reactive({ type: '', categoryId: '', paymentMethod: '', startDate: '', endDate: '' })
const today = new Date().toISOString().slice(0, 10)
const form = reactive({ id: '', type: 'EXPENSE' as MovementType, amount: '', description: '', date: today, paymentMethod: 'YAPE' as PaymentMethod, destinationPaymentMethod: 'CASH' as PaymentMethod, categoryId: '' })
const budgetForm = reactive({ amount: '', startDate: today.slice(0, 8) + '01', endDate: today })
const money = (value: number | string) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))
const labels: Record<string, string> = { INCOME: 'Ingreso', EXPENSE: 'Gasto', TRANSFER: 'Transferencia', CASH: 'Efectivo', YAPE: 'Yape', BANK_TRANSFER: 'Banco', UNIVERSITY: 'Universidad', TRANSPORT: 'Transporte', FOOD: 'Comida', ENTERTAINMENT: 'Entretenimiento', CLOTHING: 'Ropa', TECHNOLOGY: 'Tecnología', OTHER: 'Otros' }
const monthMax = computed(() => Math.max(1, ...evolution.value.flatMap(x => [x.income, x.expenses])))

async function loadAll() {
  if (!session.value) return
  loading.value = true
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    const [m, all, c, s, cat, evo, b] = await Promise.all([
      api.get('/movements', { params }), api.get('/movements'), api.get('/categories'), api.get('/dashboard/summary', { params }),
      api.get('/dashboard/categories', { params }), api.get('/dashboard/evolution'), api.get('/budgets')
    ])
    movements.value = m.data; allMovements.value = all.data; categories.value = c.data; summary.value = s.data
    categoryData.value = cat.data; evolution.value = evo.data; budgets.value = b.data
  } catch (e: any) { message.value = e.response?.data?.error || 'No se pudieron cargar los datos.' }
  finally { loading.value = false }
}
async function submitAuth() {
  busy.value = true; message.value = ''
  const result = authMode.value === 'login' ? await authService.signIn(auth.email, auth.password) : await authService.signUp(auth.email, auth.password)
  busy.value = false
  if (result.error) message.value = result.error.message
  else if (authMode.value === 'signup' && !result.data.session) message.value = 'Cuenta creada. Revisa tu correo para confirmarla.'
}
function resetForm() { Object.assign(form, { id: '', type: 'EXPENSE', amount: '', description: '', date: today, paymentMethod: 'YAPE', destinationPaymentMethod: 'CASH', categoryId: '' }) }
function editMovement(m: Movement) { Object.assign(form, { id: m.id, type: m.type, amount: String(m.amount), description: m.description || '', date: m.date.slice(0, 10), paymentMethod: m.paymentMethod, destinationPaymentMethod: m.destinationPaymentMethod || 'CASH', categoryId: m.categoryId || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
async function saveMovement() {
  busy.value = true; message.value = ''
  const payload: any = { ...form, amount: Number(form.amount), date: new Date(form.date + 'T12:00:00').toISOString() }
  delete payload.id
  if (form.type !== 'EXPENSE') delete payload.categoryId
  if (form.type !== 'TRANSFER') delete payload.destinationPaymentMethod
  try { form.id ? await api.patch(`/movements/${form.id}`, payload) : await api.post('/movements', payload); resetForm(); await loadAll() }
  catch (e: any) { message.value = e.response?.data?.error || 'No se pudo guardar el movimiento.' }
  finally { busy.value = false }
}
async function removeMovement(id: string) { if (!confirm('¿Eliminar este movimiento?')) return; await api.delete(`/movements/${id}`); await loadAll() }
async function saveBudget() { busy.value = true; try { await api.post('/budgets', { amount: Number(budgetForm.amount), startDate: new Date(budgetForm.startDate + 'T12:00:00').toISOString(), endDate: new Date(budgetForm.endDate + 'T12:00:00').toISOString() }); budgetForm.amount = ''; await loadAll() } finally { busy.value = false } }
async function removeBudget(id: string) { if (!confirm('¿Eliminar este presupuesto?')) return; await api.delete(`/budgets/${id}`); await loadAll() }
function spentFor(b: Budget) { return allMovements.value.filter(m => m.type === 'EXPENSE' && new Date(m.date) >= new Date(b.startDate) && new Date(m.date) <= new Date(b.endDate)).reduce((n, m) => n + Number(m.amount), 0) }

onMounted(async () => {
  session.value = (await supabase.auth.getSession()).data.session
  supabase.auth.onAuthStateChange((_event, next) => { session.value = next; if (next) loadAll() })
  await loadAll(); loading.value = false
})
</script>

<template>
  <main v-if="!session" class="auth-shell">
    <section class="auth-copy"><div class="brand">N<span>↑</span></div><p class="eyebrow">FINANZAS PERSONALES</p><h1>Tu dinero,<br><em>bajo control.</em></h1><p>Registra cada movimiento y entiende con claridad hacia dónde va tu dinero.</p></section>
    <form class="auth-card" @submit.prevent="submitAuth"><h2>{{ authMode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta' }}</h2><p>{{ authMode === 'login' ? 'Ingresa para ver tus finanzas.' : 'Empieza a ordenar tus finanzas hoy.' }}</p><label>Correo<input v-model="auth.email" type="email" required placeholder="tu@correo.com"></label><label>Contraseña<input v-model="auth.password" type="password" required minlength="6" placeholder="••••••••"></label><p v-if="message" class="notice">{{ message }}</p><button class="primary" :disabled="busy">{{ busy ? 'Procesando…' : authMode === 'login' ? 'Ingresar' : 'Crear cuenta' }}</button><button type="button" class="link" @click="authMode = authMode === 'login' ? 'signup' : 'login'; message = ''">{{ authMode === 'login' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo una cuenta' }}</button></form>
  </main>

  <div v-else class="app-shell">
    <aside><div class="brand">N<span>↑</span></div><nav><button :class="{active:view==='dashboard'}" @click="view='dashboard'">⌂ <span>Resumen</span></button><button :class="{active:view==='movements'}" @click="view='movements'">↔ <span>Movimientos</span></button><button :class="{active:view==='budgets'}" @click="view='budgets'">◎ <span>Presupuestos</span></button></nav><button class="logout" @click="authService.signOut()">↪ <span>Salir</span></button></aside>
    <section class="content">
      <header><div><p class="eyebrow">MI ESPACIO FINANCIERO</p><h1>{{ view === 'dashboard' ? 'Hola, revisemos tus números.' : view === 'movements' ? 'Tus movimientos' : 'Tus presupuestos' }}</h1></div><button class="primary compact" @click="view='movements'; resetForm()">＋ Nuevo movimiento</button></header>
      <p v-if="message" class="notice">{{ message }}</p>
      <div v-if="loading" class="empty">Cargando tus finanzas…</div>

      <template v-else-if="view==='dashboard'">
        <div class="period"><input v-model="filters.startDate" type="date"><span>—</span><input v-model="filters.endDate" type="date"><button @click="loadAll">Aplicar</button></div>
        <div class="stats"><article><small>INGRESOS</small><strong>{{ money(summary.income) }}</strong><i class="up">↑ entradas</i></article><article><small>GASTOS</small><strong>{{ money(summary.expenses) }}</strong><i class="down">↓ salidas</i></article><article class="dark"><small>BALANCE DEL PERÍODO</small><strong>{{ money(summary.balance) }}</strong><i>{{ summary.expensePercentage.toFixed(0) }}% de ingresos gastado</i></article></div>
        <div class="grid"><article class="panel"><div class="panel-title"><h2>Evolución mensual</h2><span>Ingresos / Gastos</span></div><div v-if="!evolution.length" class="empty">Aún no hay datos</div><div v-else class="chart"><div v-for="row in evolution" :key="row.month" class="bar-group"><div class="bars"><i class="income" :style="{height: `${Math.max(3,row.income/monthMax*150)}px`}"></i><i class="expense" :style="{height: `${Math.max(3,row.expenses/monthMax*150)}px`}"></i></div><small>{{ row.month.slice(5) }}/{{ row.month.slice(2,4) }}</small></div></div></article><article class="panel"><div class="panel-title"><h2>Gastos por categoría</h2></div><div v-if="!categoryData.length" class="empty">Aún no hay gastos</div><div v-for="cat in categoryData" :key="cat.category" class="category-row"><span>{{ labels[cat.category] }}</span><b>{{ money(cat.amount) }}</b><div><i :style="{width: `${cat.percentage}%`}"></i></div><small>{{ cat.percentage.toFixed(0) }}%</small></div></article></div>
        <article class="panel recent"><div class="panel-title"><h2>Movimientos recientes</h2><button class="link" @click="view='movements'">Ver todos →</button></div><div v-if="!movements.length" class="empty">Registra tu primer movimiento</div><div v-for="m in movements.slice(0,5)" :key="m.id" class="movement-row"><div class="movement-icon" :class="m.type">{{ m.type==='INCOME'?'↓':m.type==='EXPENSE'?'↑':'↔' }}</div><div><b>{{ m.description || labels[m.type] }}</b><small>{{ new Date(m.date).toLocaleDateString('es-PE') }} · {{ labels[m.paymentMethod] }}</small></div><strong :class="m.type">{{ m.type==='EXPENSE'?'-':m.type==='INCOME'?'+':'' }}{{ money(m.amount) }}</strong></div></article>
      </template>

      <template v-else-if="view==='movements'">
        <form class="panel movement-form" @submit.prevent="saveMovement"><div class="panel-title"><h2>{{ form.id ? 'Editar movimiento' : 'Registrar movimiento' }}</h2><button v-if="form.id" type="button" class="link" @click="resetForm">Cancelar</button></div><div class="form-grid"><label>Tipo<select v-model="form.type"><option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option><option value="TRANSFER">Transferencia</option></select></label><label>Monto (S/)<input v-model="form.amount" type="number" min="0.01" step="0.01" required></label><label>Fecha<input v-model="form.date" type="date" required></label><label>{{ form.type==='TRANSFER' ? 'Desde' : 'Medio' }}<select v-model="form.paymentMethod"><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="BANK_TRANSFER">Banco</option></select></label><label v-if="form.type==='TRANSFER'">Hacia<select v-model="form.destinationPaymentMethod"><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="BANK_TRANSFER">Banco</option></select></label><label v-if="form.type==='EXPENSE'">Categoría<select v-model="form.categoryId" required><option value="" disabled>Selecciona</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ labels[c.name] }}</option></select></label><label class="wide">Descripción<input v-model="form.description" maxlength="255" placeholder="¿En qué fue?"></label></div><button class="primary" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar movimiento' }}</button></form>
        <div class="filters"><select v-model="filters.type" @change="loadAll"><option value="">Todos los tipos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Gastos</option><option value="TRANSFER">Transferencias</option></select><select v-model="filters.paymentMethod" @change="loadAll"><option value="">Todos los medios</option><option value="CASH">Efectivo</option><option value="YAPE">Yape</option><option value="BANK_TRANSFER">Banco</option></select><input v-model="filters.startDate" type="date" @change="loadAll"><input v-model="filters.endDate" type="date" @change="loadAll"></div>
        <article class="panel"><div v-if="!movements.length" class="empty">No hay movimientos con estos filtros.</div><div v-for="m in movements" :key="m.id" class="movement-row"><div class="movement-icon" :class="m.type">{{ m.type==='INCOME'?'↓':m.type==='EXPENSE'?'↑':'↔' }}</div><div><b>{{ m.description || labels[m.type] }}</b><small>{{ new Date(m.date).toLocaleDateString('es-PE') }} · {{ labels[m.paymentMethod] }}<template v-if="m.destinationPaymentMethod"> → {{ labels[m.destinationPaymentMethod] }}</template><template v-if="m.category"> · {{ labels[m.category.name] }}</template></small></div><strong :class="m.type">{{ m.type==='EXPENSE'?'-':m.type==='INCOME'?'+':'' }}{{ money(m.amount) }}</strong><button class="icon-btn" @click="editMovement(m)">✎</button><button class="icon-btn danger" @click="removeMovement(m.id)">×</button></div></article>
      </template>

      <template v-else>
        <form class="panel budget-form" @submit.prevent="saveBudget"><div class="panel-title"><h2>Crear presupuesto</h2></div><div class="form-grid"><label>Monto (S/)<input v-model="budgetForm.amount" type="number" min="0.01" step="0.01" required></label><label>Desde<input v-model="budgetForm.startDate" type="date" required></label><label>Hasta<input v-model="budgetForm.endDate" type="date" required></label></div><button class="primary" :disabled="busy">Guardar presupuesto</button></form>
        <div class="budget-grid"><article v-for="b in budgets" :key="b.id" class="panel budget"><button class="icon-btn danger" @click="removeBudget(b.id)">×</button><small>PRESUPUESTO</small><strong>{{ money(b.amount) }}</strong><p>{{ new Date(b.startDate).toLocaleDateString('es-PE') }} — {{ new Date(b.endDate).toLocaleDateString('es-PE') }}</p><div class="progress"><i :style="{width:`${Math.min(100,spentFor(b)/Number(b.amount)*100)}%`}"></i></div><p><b>{{ money(spentFor(b)) }}</b> utilizado · {{ money(Math.max(0,Number(b.amount)-spentFor(b))) }} disponible</p></article><div v-if="!budgets.length" class="empty">Crea un presupuesto para controlar cuánto puedes gastar.</div></div>
      </template>
    </section>
  </div>
</template>
