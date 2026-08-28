# Despliegue en Vercel

La opción estable para este repositorio es crear **dos proyectos de Vercel conectados al mismo repositorio de GitHub**:

| Proyecto sugerido | Directorio raíz | Framework | Función |
| --- | --- | --- | --- |
| `numo-api` | `backend` | Fastify | API y acceso a Supabase |
| `numo-web` | `frontend` | Vite | Aplicación Vue estática |

Vercel Services permitiría agruparlos en un solo proyecto, pero actualmente es una función beta. Dos proyectos ofrecen dominios, variables, logs y despliegues independientes y funcionan en todos los planes normales.

## 0. Cerrar alertas de seguridad

No publiques datos reales mientras Supabase Security Advisor muestre `RLS Disabled in Public`. El navegador solo necesita Supabase Auth; no necesita consultar directamente las tablas administradas por Prisma. Antes de producción, protege `User`, `Movement`, `Budget`, `Category`, las nuevas tablas financieras y `_prisma_migrations` mediante RLS o revocando sus permisos a los roles `anon` y `authenticated`. La API puede conservar acceso mediante la conexión PostgreSQL privada.

Activa también la protección de contraseñas filtradas en Supabase Auth. Después de los cambios, vuelve a ejecutar Security Advisor y exige cero alertas críticas antes de cargar información financiera real.

## 1. Preparar Supabase

Antes del primer despliegue, aplica las migraciones y el seed desde una máquina confiable. Las migraciones no se ejecutan durante cada build de Vercel:

```bash
cd backend
npm ci
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

Usa la URL del **Transaction pooler** de Supabase para `DATABASE_URL` y la URL del **Session pooler** para `DIRECT_URL`. No uses la conexión directa si tu red o el proveedor no tiene compatibilidad IPv6.

Copia las URLs desde `Supabase > Connect` después de rotar o confirmar la contraseña. Si construyes una URL manualmente, codifica los caracteres reservados de la contraseña (`%`, `@`, `#`, `/`, `:`) con percent-encoding; una contraseña sin codificar puede hacer que Prisma interprete mal el host o las opciones.

## 2. Crear el proyecto de la API

En Vercel, importa `JeanpierMorales/financial-tracker` y configura:

- Project Name: `numo-api`
- Root Directory: `backend`
- Framework Preset: `Fastify`
- Production Branch: `main`

Variables para `Production` y, si se necesitan previews, para `Preview`:

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=1&uselibpqcompat=true&sslmode=require
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?uselibpqcompat=true&sslmode=require
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=SUPABASE_ANON_KEY
CORS_ORIGIN=https://TU-WEB.vercel.app
```

`PORT` no se configura en Vercel; la plataforma gestiona el puerto. `DIRECT_URL` se usa para generar Prisma durante una instalación limpia y para comandos de migración. Nunca debe exponerse al frontend.

`CORS_ORIGIN` acepta uno o varios orígenes exactos separados por comas, sin `/` final. Es obligatoria en producción: la API no inicia si falta, evitando publicar accidentalmente un CORS abierto. Debe contener al menos el dominio de `numo-web`. Para probar un preview, añade temporalmente su URL exacta; las URLs dinámicas de preview no admiten un comodín en esta variable.

El archivo `backend/vercel.json` fija el preset Fastify y ejecuta la función en `sfo1`, una región cercana al pool actual de Supabase en AWS `us-west-2`. Si la base cambia de región, actualiza este valor para mantener baja latencia.

Después de desplegar, valida:

```bash
curl --fail --show-error --silent https://TU-API.vercel.app/health
curl --fail --show-error --silent https://TU-API.vercel.app/health/db
```

La documentación interactiva queda en `https://TU-API.vercel.app/docs`.

## 3. Crear el proyecto web

Importa nuevamente el mismo repositorio y configura:

- Project Name: `numo-web`
- Root Directory: `frontend`
- Framework Preset: `Vite`
- Production Branch: `main`

Variables para `Production`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUPABASE_ANON_KEY
VITE_API_URL=https://TU-API.vercel.app/api
```

Todas las variables `VITE_*` quedan incluidas en el JavaScript del navegador. La clave anónima de Supabase está diseñada para uso público; no coloques allí la contraseña de la base, `DIRECT_URL`, claves `service_role` ni tokens privados.

El `frontend/vercel.json` mantiene el build de Vite en `dist` y añade el fallback necesario para una SPA.

Después del primer despliegue, añade en Supabase Authentication las URLs permitidas de la web:

```text
Site URL: https://TU-WEB.vercel.app
Redirect URL: https://TU-WEB.vercel.app/**
```

## 4. Despliegue desde GitHub

Con ambos proyectos conectados, cada push a `main` publica una nueva versión de producción y cada pull request genera previews. La API debe desplegarse primero para poder usar su URL en `VITE_API_URL`; después se redepliega la web.

## Alternativa por CLI no interactiva

Requiere Vercel CLI 48.6.0 o superior para la detección actual de Fastify. Crea primero ambos proyectos en el dashboard y genera un token en Vercel Account Settings. Los valores siguientes son marcadores; no los escribas en el repositorio:

```bash
export VERCEL_TOKEN='TOKEN_PERSONAL_O_DE_EQUIPO'
export VERCEL_SCOPE='USUARIO_O_SLUG_DEL_EQUIPO'

npx --yes vercel@48.6.0 link --cwd backend --yes --project numo-api --scope "$VERCEL_SCOPE" --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 link --cwd frontend --yes --project numo-web --scope "$VERCEL_SCOPE" --token "$VERCEL_TOKEN"
```

Después de configurar variables de `Preview` en cada proyecto, prepara localmente los artefactos de preview sin desplegarlos:

```bash
npx --yes vercel@48.6.0 pull --cwd backend --yes --environment=preview --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 build --cwd backend --token "$VERCEL_TOKEN"

npx --yes vercel@48.6.0 pull --cwd frontend --yes --environment=preview --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 build --cwd frontend --token "$VERCEL_TOKEN"
```

Para crear primero previews a partir de esos builds:

```bash
npx --yes vercel@48.6.0 deploy --cwd backend --prebuilt --yes --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 deploy --cwd frontend --prebuilt --yes --token "$VERCEL_TOKEN"
```

Para producción, vuelve a hacer `pull` y `build` con el entorno de producción, valida el resultado y despliega el mismo artefacto:

```bash
npx --yes vercel@48.6.0 pull --cwd backend --yes --environment=production --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 build --cwd backend --prod --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 deploy --cwd backend --prebuilt --prod --yes --token "$VERCEL_TOKEN"

npx --yes vercel@48.6.0 pull --cwd frontend --yes --environment=production --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 build --cwd frontend --prod --token "$VERCEL_TOKEN"
npx --yes vercel@48.6.0 deploy --cwd frontend --prebuilt --prod --yes --token "$VERCEL_TOKEN"
```

Las variables se administran preferentemente en `Project Settings > Environment Variables`. No copies archivos `.env`, `.env.local` ni `.vercel` al repositorio. En CI pueden omitirse los enlaces locales y utilizar `VERCEL_ORG_ID` y el `VERCEL_PROJECT_ID` correspondiente a cada proyecto.

## Verificación posterior

1. `GET /health` responde `200`.
2. `GET /health/db` responde `database: connected`.
3. El registro/inicio de sesión funciona desde el dominio web.
4. Categorías, movimientos, presupuestos y dashboard cargan sin errores `401`, CORS o `500`.
5. Los logs de la API no muestran errores de Prisma ni agotamiento de conexiones.

Referencias oficiales:

- [Fastify en Vercel](https://vercel.com/docs/frameworks/backend/fastify)
- [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Monorepos en Vercel](https://vercel.com/docs/monorepos)
- [Variables de entorno](https://vercel.com/docs/environment-variables)
