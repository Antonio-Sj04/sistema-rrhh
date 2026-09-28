# Sistema de Recursos Humanos

Aplicación web SPA para la gestión de personal, nómina (Guatemala) y reclutamiento.

- **Frontend:** HTML5 + CSS3 puro + JavaScript ES6+ (módulos) con [Vite](https://vitejs.dev). SPA con **History API**.
- **Backend:** API REST propia (`/api/v1`) en Netlify Functions (Node.js), consumida con `fetch`/`async-await`.
- **Datos:** [Supabase](https://supabase.com) — PostgreSQL (tablas relacionales + JSONB), Auth, Storage y RLS.

## Arquitectura

```
Navegador (SPA)  ──fetch──▶  API REST /api/v1 (Netlify Functions)  ──▶  Supabase
 History API                  · valida y sanea entradas                 · PostgreSQL + RLS
 localStorage: tema           · cookies HttpOnly/Secure/SameSite        · Auth (JWT)
 sessionStorage: borradores   · anti-CSRF (token HMAC + Origin)         · Storage (CV, documentos)
 cookie de sesión (HttpOnly)  · SQL directo (reportes, JSONB)
```

- **El navegador no tiene ninguna clave de Supabase.** Todo pasa por la API; la clave `service_role` y la conexión SQL solo existen como variables de entorno del servidor.
- **Sesión:** la API inicia sesión en Supabase Auth y guarda los tokens en cookies `HttpOnly; Secure; SameSite=Strict; Path=/api`. JavaScript no puede leerlas (mitiga XSS) y no se envían desde otros sitios (mitiga CSRF). El token se renueva solo.
- **Anti-CSRF:** además de `SameSite=Strict`, `/auth/login` y `/auth/sesion` entregan un token CSRF (HMAC del id de sesión) que la SPA guarda solo en memoria y envía en `X-CSRF-Token` en cada modificación.
- **Sanitización en dos capas:** el cliente limpia el cuerpo antes de enviarlo (`src/api.js`) y la API vuelve a sanear y validar todo (`server/sanear.js`).
- **RLS siempre activo:** la API consulta Supabase con el token del usuario; las consultas SQL directas adoptan su identidad (`set local role authenticated` + `request.jwt.claims`).
- **History API:** URLs limpias (`/empleados/123`) con `pushState`/`replaceState`/`popstate`; `netlify.toml` sirve `index.html` en cualquier ruta.
- **Almacenamiento web:** `localStorage` guarda el tema (claro/oscuro/sistema); `sessionStorage` guarda el borrador del formulario de postulación de 3 pasos; la sesión vive en cookies HttpOnly.

### Endpoints principales

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Inicia sesión, crea cookies HttpOnly | 200, 400, 401, 403 |
| GET | `/api/v1/auth/sesion` | Usuario y perfil actual (renueva el token) | 200 |
| POST | `/api/v1/auth/logout` | Cierra sesión (`{ todos: true }` en todos los dispositivos) | 200 |
| POST | `/api/v1/auth/recuperar` | Envía correo de recuperación | 200, 400 |
| POST | `/api/v1/auth/verificar` | Valida enlaces de invitación/recuperación | 200, 400 |
| PUT | `/api/v1/auth/password` | Cambia la contraseña | 200, 400, 401 |
| GET | `/api/v1/{recurso}` | Lista con `filtros`, `orden`, `limite`, `select`, `conteo` | 200, 400, 401, 403 |
| GET | `/api/v1/{recurso}/{id}` | Un registro | 200, 401, 404 |
| POST | `/api/v1/{recurso}` | Crea (`{ datos }`) | 201, 400, 401, 403, 409 |
| PUT | `/api/v1/{recurso}/{id}` | Actualiza (`{ datos }`) | 200, 400, 401, 403 |
| DELETE | `/api/v1/{recurso}/{id}` | Elimina | 200, 401, 403, 409 |
| POST / DELETE | `/api/v1/usuarios[/{id}]` | Invita o elimina cuentas (admin) | 201, 200, 403, 409 |
| POST | `/api/v1/postulaciones/{id}/contratar` | Convierte al postulante en empleado | 201, 403 |
| GET / POST / DELETE | `/api/v1/archivos/{bucket}` | Sube, descarga (`/url`) y borra archivos | 201, 200, 400, 413 |
| GET | `/api/v1/reportes/resumen` | Indicadores (SQL directo) | 200, 401 |
| GET | `/api/v1/reportes/bitacora` | Bitácora con búsqueda en JSONB (SQL directo) | 200, 400, 401 |
| GET | `/api/v1/publico/vacantes` | Vacantes publicadas (sin sesión) | 200 |
| POST | `/api/v1/publico/postulaciones` | Postulación con CV (multipart) | 201, 400, 404, 413, 429 |

Recursos disponibles: ver la lista blanca en [`server/recursos.js`](server/recursos.js). Errores: `{ "error": { "codigo", "mensaje" } }`. Toda petición que modifica datos exige la cabecera `X-Requested-With: fetch` y, si usa la cookie de sesión, `X-CSRF-Token`. Para probar con Postman o curl se puede usar `Authorization: Bearer <JWT>` en lugar de la cookie.

## Arquitectura de datos

Un proyecto de Supabase con **dos bases de datos lógicas** (esquemas de PostgreSQL), aisladas con permisos y Row Level Security:

| Esquema | Contenido |
|---|---|
| `empresa` | Departamentos, puestos, empleados, contratos, ausencias, evaluaciones, documentos, parámetros y períodos de nómina, recibos, bitácora de auditoría |
| `reclutamiento` | Vacantes, postulantes, educación, experiencia, referencias, antecedentes, postulaciones (etapas), entrevistas |
| `public` | `perfiles`: rol de cada usuario y su vínculo con un empleado |

Archivos privados en Storage: bucket `cvs` (CV y antecedentes) y bucket `documentos` (expediente del empleado).

### Roles

| Rol | Acceso |
|---|---|
| `admin` | Todo, incluyendo usuarios y bitácora |
| `rrhh` | Personal, reclutamiento, lectura de nómina |
| `nomina` | Nómina y lectura de empleados |
| `jefe` | Su equipo (ver, aprobar ausencias, evaluar) y las vacantes de su departamento |
| `empleado` | Solo su portal: datos, recibos publicados, solicitudes de vacaciones |

Las reglas se aplican **en la base de datos** (RLS), no solo en la interfaz.

## Instalación

### 1. Crear el proyecto en Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (región recomendada: **South America (São Paulo)**).
2. En **SQL Editor**, ejecuta el contenido de `supabase/migrations/20260923000001_esquema_inicial.sql`.
3. (Opcional) Ejecuta `supabase/seed.sql` para crear departamentos y puestos de ejemplo.
4. En **Project Settings → Data API → Exposed schemas**, agrega `empresa` y `reclutamiento`. **Sin este paso la app no puede leer las tablas.**

### 2. Configurar la autenticación
1. **Authentication → Sign In / Providers → Email**: desactiva *Allow new users to sign up* (los usuarios solo entran por invitación).
2. **Authentication → URL Configuration**: define la *Site URL* (tu dominio) y agrega en *Redirect URLs* `http://localhost:5173/**` y `https://tu-dominio/**`.
3. Crea tu primer usuario en **Authentication → Users → Add user** (con contraseña) y hazlo administrador desde el SQL Editor:
   ```sql
   update public.perfiles set rol = 'admin' where email = 'tu-correo@ejemplo.com';
   ```

### 3. Ejecutar la aplicación
```bash
cp .env.example .env   # completa las 4 variables del backend
npm install
npm run dev            # http://localhost:5173 (sirve la app y la API /api/v1)
npm test               # pruebas: nómina, montos en letras, validaciones y seguridad de la API
```

### 4. Publicar en Netlify
`netlify.toml` ya define el build (`npm run build` → `dist`), la función de la API y las redirecciones. En **Environment variables** agrega `SUPABASE_URL`, `SUPABASE_ANON_KEY`, y como **secretas** `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL`.

## Módulos

- **Inicio:** indicadores (empleados activos, solicitudes pendientes, vacantes, última nómina)
- **Empleados:** expediente completo, contratos e historial salarial, ausencias, evaluaciones, documentos, recibos, baja
- **Organización:** departamentos (con jefe) y puestos con banda salarial
- **Vacaciones y permisos:** solicitudes con flujo de aprobación (15 días hábiles anuales)
- **Nómina:** planilla mensual, Aguinaldo y Bono 14; ajustes por horas extra, comisiones y descuentos; cierre del período; recibo imprimible; exportación a CSV y archivo para el banco
- **Reclutamiento:** vacantes, banco de postulantes con CV, antecedentes (penales, policíacos, RENAS…), referencias, tablero Kanban de selección, entrevistas y **contratación en un clic** (crea el empleado en la base de la empresa)
- **Administración:** invitación de usuarios, roles, vínculo usuario-empleado y bitácora de cambios
- **Liquidación laboral:** al dar de baja calcula indemnización, aguinaldo, Bono 14, vacaciones y salario pendiente, con vista previa e impresión
- **Gráficas del inicio:** costo de planilla, altas y bajas, personal por departamento y candidatos por etapa
- **Constancias en PDF:** laboral y de ingresos (con montos en letras), con código de verificación; el empleado las descarga desde su portal
- **Portal público de empleo** (`#/empleos`): vacantes publicadas y postulación con CV sin crear cuenta, a través de la Edge Function `postular`

## Nómina (Guatemala)

Cálculos en `src/lib/nomina-gt.js`, con parámetros editables desde la app (tabla `empresa.parametros_nomina`):

- **IGSS laboral** 4.83 % sobre salario + horas extra + otros ingresos afectos (no sobre la bonificación incentivo)
- **Cuota patronal:** IGSS 10.67 %, IRTRA 1 %, INTECAP 1 %
- **Bonificación incentivo:** Q250 (Decreto 37-2001), proporcional a los días laborados
- **ISR asalariados:** proyección anual − Q48,000 − IGSS; 5 % hasta Q300,000 y 7 % sobre el excedente; retención mensual = anual / 12
- **Horas extra:** salario / 30 / 8 × 1.5
- **Aguinaldo** (1 dic – 30 nov) y **Bono 14** (1 jul – 30 jun): un salario, proporcional al tiempo laborado y exentos de IGSS/ISR
- Las faltas, los permisos sin goce y las suspensiones del IGSS aprobadas descuentan días

> ⚠️ El ISR se calcula con una proyección simplificada. Valida los resultados con tu contador y actualiza los parámetros cuando cambie la ley.

## Protección de datos personales

- Casilla de **consentimiento** del postulante, con fecha de registro
- Archivos privados con URLs firmadas que expiran en 1 hora
- `reclutamiento.purgar_postulantes(meses)` elimina postulantes antiguos sin procesos activos. Puedes programarla con `pg_cron`:
  ```sql
  select cron.schedule('purgar-postulantes', '0 3 1 * *', $$select reclutamiento.purgar_postulantes(24)$$);
  ```
- Bitácora de auditoría de cambios en empleados, contratos, nómina, postulantes, antecedentes y roles

## Estructura

```
├── index.html
├── src/
│   ├── main.js            # arranque y manejo de enlaces de invitación/recuperación
│   ├── router.js          # rutas SPA con History API y control de acceso por rol
│   ├── auth.js            # sesión y perfil del usuario
│   ├── api.js             # cliente fetch de la API REST (/api/v1)
│   ├── tema.js            # tema claro/oscuro (localStorage)
│   ├── layout.js          # menú lateral según el rol
│   ├── ui.js              # tablas, formularios, modales, notificaciones
│   ├── sublista.js        # listas relacionadas reutilizables
│   ├── catalogos.js       # catálogos y formularios compartidos
│   ├── lib/nomina-gt.js   # cálculos de nómina
│   ├── styles/main.css
│   └── views/             # una vista por pantalla
├── server/                # API REST: rutas, validación, cookies, SQL directo
├── netlify/functions/     # función que publica la API en /api/v1
├── supabase/
│   ├── migrations/        # esquema, RLS, Storage
│   ├── functions/invitar-usuario/
│   └── seed.sql
└── tests/
```
