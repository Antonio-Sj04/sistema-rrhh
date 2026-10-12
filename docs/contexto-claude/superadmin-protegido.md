---
name: superadmin-protegido
description: perfiles.protegido marks the owner as superadmin; DB trigger blocks delete/modify by others (live since 2026-10-08)
metadata:
  type: project
---

On 2026-10-08 a teammate with admin role deleted the owner's account (antoniosamayoa5@gmail.com); the owner recreated it from the Supabase dashboard. Fix applied in the DB (migration 20261008000001_superadmin_protegido.sql): column `public.perfiles.protegido` + trigger `proteger_superadmin` (before update/delete). A protected profile cannot be deleted (also blocks the auth.users cascade, so the app button and the dashboard Authentication UI fail) nor modified by anyone but themselves; the flag itself only changes from the Supabase SQL editor (session_user postgres, no JWT). Owner's profile has protegido = true.

**Why:** all teammates are admins for the class demo, so role alone does not protect the owner.
**How to apply:** to remove or unprotect that account, first run `update public.perfiles set protegido = false where email = '...'` in the SQL editor. The UI badge and API 403 were published with PR #3 on 2026-10-08, together with a fix for PUT /auth/password (supabase-js auth.updateUser needs an in-library session, so the API now calls PUT /auth/v1/user with the cookie token). Credits: see [[netlify-creditos]].
