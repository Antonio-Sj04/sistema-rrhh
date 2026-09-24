# Sistema de Recursos Humanos

Aplicación web SPA para la gestión de personal, nómina (Guatemala) y reclutamiento.

- **Frontend:** HTML + CSS + JavaScript (módulos ES) con [Vite](https://vitejs.dev)
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL, Auth, Storage y Edge Functions
- **Router:** SPA basada en hash (`#/empleados`), funciona en cualquier hosting estático

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

### 3. Publicar la función de invitaciones
Permite a los administradores invitar usuarios desde la app:
```bash
npx supabase login
npx supabase functions deploy invitar-usuario --project-ref TU_PROJECT_REF
npx supabase functions deploy eliminar-usuario --project-ref TU_PROJECT_REF
# Portal de empleo: función pública, valida todo internamente
npx supabase functions deploy postular --no-verify-jwt --project-ref TU_PROJECT_REF
```

### 4. Ejecutar la aplicación
```bash
cp .env.example .env   # y completa URL y anon key (Project Settings → API)
npm install
npm run dev            # http://localhost:5173
npm test               # pruebas de los cálculos de nómina
```

### 5. Publicar
En **Vercel**, **Netlify** o **Cloudflare Pages**: comando de build `npm run build`, carpeta de salida `dist`, y las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

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
│   ├── router.js          # rutas SPA y control de acceso por rol
│   ├── auth.js            # sesión y perfil del usuario
│   ├── supabase.js        # cliente y helpers (esquemas, Storage)
│   ├── layout.js          # menú lateral según el rol
│   ├── ui.js              # tablas, formularios, modales, notificaciones
│   ├── sublista.js        # listas relacionadas reutilizables
│   ├── catalogos.js       # catálogos y formularios compartidos
│   ├── lib/nomina-gt.js   # cálculos de nómina
│   ├── styles/main.css
│   └── views/             # una vista por pantalla
├── supabase/
│   ├── migrations/        # esquema, RLS, Storage
│   ├── functions/invitar-usuario/
│   └── seed.sql
└── tests/
```
