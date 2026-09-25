# Cómo retomar el proyecto en otra computadora

Estado al 25 de septiembre de 2026.

## 1. Preparar la computadora
1. Instala **Node.js 22+**, **Git** y **Claude Code** (app de escritorio).
2. Copia esta carpeta completa. Puedes omitir `node_modules` (pesa 85 MB y se reinstala).
3. En la carpeta del proyecto ejecuta:
   ```bash
   npm install
   npm run dev
   ```
   La app y la API quedan en http://localhost:5173.
4. El archivo `.env` tiene las variables del servidor. No está en GitHub a propósito; si falta, cópialo de `.env.example` y complétalo con los mismos valores que están en Netlify.

## 2. Ponerle contexto a Claude
Al abrir el proyecto en Claude Code, pide: **«Lee CONTINUAR.md y docs/contexto-claude/ para ponerte al día»**. Ahí está lo que ya se configuró y las reglas acordadas.

## 3. Estado actual
| Tema | Estado |
|---|---|
| Rama `main` | Versión publicada en https://proyectodesw.netlify.app (sin la API REST) |
| Rama `api-rest` | Cumple todos los requerimientos técnicos obligatorios: API REST propia, cookies HttpOnly, History API, SQL directo y almacenamiento web. **Aún no se ha fusionado a `main`.** |
| Supabase | Proyecto `sistema-rrhh` (ref `oclvfhrehdkfglqsgckh`, São Paulo). Migraciones en `supabase/migrations/`. |
| Correo | SMTP de Gmail configurado; plantillas en español en `supabase/templates/`. |
| Documento Fase 1 | `docs/Fase1_Sistema_RRHH.docx` (28 páginas). Faltan los datos entre corchetes `[ ]`. Entrega: 27 de septiembre. |

## 4. Pasos pendientes
1. **Netlify → Environment variables:** agregar como secretas `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` (Transaction pooler, puerto 6543).
2. **GitHub:** crear la solicitud de cambios de `api-rest` hacia `main`: https://github.com/Antonio-Sj04/sistema-rrhh/pull/new/api-rest
3. **Probar la vista previa (Deploy Preview)** de Netlify: login, navegación, bitácora, tema, usuarios, archivos, portal de empleo y cierre de sesión.
4. Si todo funciona, **fusionar a `main`** para publicar.
5. **Documento Fase 1:** completar portada, integrantes y roles RACI; exportar a PDF desde Word.

## 5. Reglas acordadas
- No agregar la línea `Co-Authored-By` en los commits: Netlify bloquea los despliegues de repositorios privados si detecta un colaborador no reconocido.
- Nunca subir `.env` ni poner claves secretas en el código del navegador.
- Después de cada publicación, verificar en el sitio real que la versión nueva esté activa.
