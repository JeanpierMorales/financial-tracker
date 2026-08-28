# Norte — Finanzas personales

Aplicación personal y responsive para registrar ingresos, gastos y transferencias; organizar cuentas, ahorros e inversiones; definir metas y presupuestos; y revisar el flujo financiero por semana, mes o año.

## Stack

- Frontend: Vue 3 + TypeScript + Vite
- API: Fastify + Zod
- Datos: PostgreSQL + Prisma
- Autenticación: Supabase Auth

## Configuración

1. Crea un proyecto en Supabase y copia las variables de los archivos `.env.example`.
2. En `backend`, ejecuta `npm install`, `npx prisma migrate deploy`, `npx prisma generate` y `npm run prisma:seed`.
3. Inicia la API con `npm run dev` dentro de `backend`.
4. En otra terminal, dentro de `frontend`, ejecuta `npm install` y `npm run dev`.
5. Abre `http://localhost:5173`. La documentación de la API está en `http://localhost:3000/docs`.

La interfaz puede instalarse como app desde el navegador del celular gracias a su manifiesto PWA.

Si Supabase exige confirmación de correo, confirma la cuenta antes de iniciar sesión. Para desarrollo local también puedes desactivar temporalmente esa opción desde Authentication > Providers > Email.

## Despliegue

La configuración de los dos proyectos Vercel, sus variables, CORS, migraciones y comandos de verificación está en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
