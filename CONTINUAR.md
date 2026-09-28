# Cómo retomar el proyecto en otra computadora

Estado al 28 de septiembre de 2026.

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
| Rama `main` | Publicada en https://proyectodesw.netlify.app con la API REST propia (PR #1 fusionado el 28/09/2026). Cumple todos los Requerimientos Técnicos Obligatorios. |
| Supabase | Proyecto `sistema-rrhh` (ref `oclvfhrehdkfglqsgckh`, São Paulo). Migraciones en `supabase/migrations/`. |
| Correo | SMTP de Gmail configurado; plantillas en español en `supabase/templates/`. |
| Documento Fase 1 | `docs/Fase1_Sistema_RRHH.docx` y `.pdf` (33 páginas, equipo de 7 con tareas por integrante). Faltan los datos entre corchetes `[ ]`. Entrega: 27 de septiembre. |

## 4. Pasos pendientes
1. **Documento Fase 1:** completar portada, integrantes y carnés (datos entre `[ ]`) y exportar a PDF desde Word.
2. **Fase 2 (10 o 17 de octubre):** demostrar 2 políticas RLS desde la consola de Supabase; preparar la demo de login, CRUD, History API y almacenamiento web.
3. **Fase 3 (7 de noviembre):** manual de despliegue formal, reporte RACI ejecutado por integrante y defensa en vivo.
4. Netlify (plan gratuito) no permite marcar variables como secretas: `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` están guardadas sin esa marca. No dar acceso a la cuenta de Netlify a otras personas.

## 5. Reglas acordadas
- No agregar la línea `Co-Authored-By` en los commits: Netlify bloquea los despliegues de repositorios privados si detecta un colaborador no reconocido.
- Nunca subir `.env` ni poner claves secretas en el código del navegador.
- Después de cada publicación, verificar en el sitio real que la versión nueva esté activa.
