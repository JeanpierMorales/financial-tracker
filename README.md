# Numo — Financial Tracker

Aplicación personal para registrar ingresos, gastos, transferencias entre medios de pago y presupuestos. Incluye autenticación, dashboard, filtros, reportes por categoría y evolución mensual.

## Stack

- Frontend: Vue 3 + TypeScript + Vite
- API: Fastify + Zod
- Datos: PostgreSQL + Prisma
- Autenticación: Supabase Auth

## Configuración

1. Crea un proyecto en Supabase y copia las variables de los archivos `.env.example`.
2. En `backend`, ejecuta `npm install`, `npx prisma migrate deploy`, `npx prisma generate` y `npx tsx prisma/seed.ts`.
3. Inicia la API con `npm run dev` dentro de `backend`.
4. En otra terminal, dentro de `frontend`, ejecuta `npm install` y `npm run dev`.
5. Abre `http://localhost:5173`. La documentación de la API está en `http://localhost:3000/docs`.

Si Supabase exige confirmación de correo, confirma la cuenta antes de iniciar sesión. Para desarrollo local también puedes desactivar temporalmente esa opción desde Authentication > Providers > Email.
