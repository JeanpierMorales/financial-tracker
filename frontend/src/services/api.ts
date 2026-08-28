import axios from 'axios'
import { supabase } from '../config/supabase'

const configuredUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '')
const baseURL = configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`

export const api = axios.create({ baseURL })

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session) config.headers.Authorization = `Bearer ${data.session.access_token}`
  return config
})
