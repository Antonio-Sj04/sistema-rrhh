# Cómo retomar el proyecto en otra computadora

Estado al 12 de octubre de 2026.

## 1. Preparar la computadora
1. Instala **Node.js 22+**, **Git** y **Claude Code** (app de escritorio).
2. Obtén el proyecto de una de estas dos formas:
   - **Con Git (recomendado):** `git clone https://github.com/Antonio-Sj04/sistema-rrhh.git` y luego `git checkout guia-estudio`.
   - **Con USB:** copia la carpeta completa. Puedes omitir `node_modules` (se reinstala).
3. Copia a mano el archivo **`.env`** desde la computadora anterior. No está en GitHub a propósito. Si no lo tienes, crea uno a partir de `.env.example` con los mismos valores que están en Netlify → Environment variables.
4. En la carpeta del proyecto ejecuta:
   ```bash
   npm install
   npm run dev
   ```
   La app y la API quedan en http://localhost:5173.
5. Si quieres la guía de estudio en PDF, cópiala aparte: está en el escritorio de la computadora anterior (`Guia_de_estudio_Sistema_RRHH.pdf`), fuera del repositorio.

## 2. Mensaje para pegar en el chat de Claude
Abre la carpeta del proyecto en Claude Code y pega esto como primer mensaje:

> Voy a continuar este proyecto desde otra computadora. Lee `CONTINUAR.md` y todos los archivos de `docs/contexto-claude/` para ponerte al día, guarda esas notas en tu memoria del proyecto y dime en qué estado estamos y qué sigue. Respóndeme en español y no publiques nada sin preguntarme.

Además, en esa computadora hay que volver a conectar **Supabase** en los conectores de Claude (misma cuenta) para que pueda consultar la base de datos.

## 3. Estado actual
| Tema | Estado |
|---|---|
| Sitio publicado | https://proyectodesw.netlify.app (rama `main`). Cumple todos los Requerimientos Técnicos Obligatorios. |
| Rama `guia-estudio` | **Sin fusionar.** Contiene la mejora de integridad de archivos (borra el archivo si falla el registro; límite de 5 MB) y este archivo actualizado. |
| Supabase | Proyecto `sistema-rrhh` (ref `oclvfhrehdkfglqsgckh`, São Paulo). 9 migraciones en `supabase/migrations/`, todas aplicadas. |
| Usuarios | `antoniosamayoa5@gmail.com` es superadministrador (`perfiles.protegido = true`). Hay 5 cuentas admin más (una inactiva). |
| Netlify | Plan gratuito con créditos: unos 180 de 300 usados en el ciclo que termina el 22 de octubre. |
| Documento Fase 1 | `docs/Fase1_Sistema_RRHH.docx` y `.pdf` (33 páginas). Faltan nombres, carnés y datos de portada (33 espacios entre `[ ]`). |
| Guía de estudio | PDF de 41 páginas, fuera del repositorio. |

## 4. Pendientes, en orden
1. **Confirmar** que el dueño ya pudo crear su contraseña con «¿Olvidaste tu contraseña?» (arreglo publicado el 8 de octubre).
2. **Fase 2 (17 de octubre):** preparar el guion para demostrar 2 políticas RLS desde la consola de Supabase y explicar que el «registro» es por invitación.
3. **Fusionar `guia-estudio` a `main`** antes de la defensa: https://github.com/Antonio-Sj04/sistema-rrhh/pull/new/guia-estudio (cuesta 15 créditos; juntar con otros cambios).
4. **Fase 3 (7 de noviembre):** manual de despliegue actualizado (el README indica 1 migración y son 9), reporte RACI ejecutado por integrante y documento de la Fase 1 actualizado con nombres y carnés.
5. Bajar el rol de los compañeros que no necesitan ser admin y vincular la cuenta del dueño a su expediente EMP-00001.
6. Desactivar en Supabase las funciones antiguas que ya no se usan (`postular`, `invitar-usuario`, `eliminar-usuario`).
7. Cambiar la contraseña de la base de datos si no se ha hecho (se compartió en un chat en septiembre) y actualizar `DATABASE_URL` en Netlify.

## 5. Reglas acordadas
- **Sin `Co-Authored-By` en los commits:** Netlify bloquea los despliegues de repositorios privados si detecta un autor no reconocido.
- **Créditos de Netlify:** cada publicación a `main` cuesta 15 de 300 créditos al mes. Juntar cambios en una sola solicitud y probar en la vista previa. No subir arreglos pequeños directo a `main`.
- **Contraseñas y claves:** Claude no las recibe ni las escribe. El dueño las ingresa en Supabase y Netlify. Nunca subir `.env`.
- **Base de datos:** los cambios se aplican en Supabase y además se guardan como archivo en `supabase/migrations/`.
- **Verificar:** después de cada publicación, comprobar en el sitio real que la versión nueva esté activa.
- **Vistas previas:** las de Netlify piden iniciar sesión, así que las prueba el dueño, no Claude.
- **Superadministrador:** para borrar o desproteger esa cuenta hay que ejecutar antes `update public.perfiles set protegido = false where email = '...'` en el editor SQL.
