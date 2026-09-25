---
name: proyecto-supabase-rrhh
description: "Supabase project for the HR system (ref, region, what is configured, remaining manual steps)"
metadata:
  node_type: memory
  type: project
  originSessionId: 2fafbf0d-f394-4761-8029-6c60d99dcea1
  modified: 2026-09-25T19:57:09.244Z
---

HR system (Vanilla JS + Vite SPA, Guatemala payroll) runs on Supabase project `sistema-rrhh`, ref `oclvfhrehdkfglqsgckh`, region sa-east-1, free plan, org `voifzutxoogkeffemgss`. Created 2026-09-23 via the Supabase MCP connector.

Configured and verified working by the user on 2026-09-23: migrations applied, schemas `empresa` and `reclutamiento` exposed, public signup disabled, redirect URLs set to localhost:5173, edge function `invitar-usuario` deployed, user antoniosamayoa5@gmail.com is admin.

Production frontend: https://proyectodesw.netlify.app (public). Code on GitHub: https://github.com/Antonio-Sj04/sistema-rrhh (private, branch main). Netlify is linked to the repo and auto-deploys on every push to main (env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set in Netlify project). Deploy = commit + `git push`. DB changes still go through the Supabase MCP (apply_migration) and must also be saved in supabase/migrations/.

Features delivered 2026-09-23 (all pushed): liquidación/indemnización, dashboard charts, PDF constancias (jsPDF, lazy), public job portal (#/empleos + public edge function `postular`, verify_jwt=false). Auth: min password 8 with upper/lower/digit; leaked-password protection unavailable on free plan; captcha must stay OFF (login doesn't send captcha tokens). Remaining security-advisor warnings are intentional (public portal RPCs, role helper functions).

Email (2026-09-24): custom SMTP = Gmail antonio.samayoa004@gmail.com (smtp.gmail.com:465, app password entered by the user), sender name "Recursos Humanos". Supabase only allows editing auth email templates once custom SMTP is set; Spanish templates live in supabase/templates/ and are pasted by hand in Authentication → Emails.

Class project (UMG): must meet "Requerimientos Técnicos Obligatorios" (own REST API, History API, HttpOnly/SameSite cookies, localStorage/sessionStorage, JSONB, direct SQL from backend, RLS, RBAC, XSS/CSRF). On 2026-09-25 branch `api-rest` rebuilt the app: API /api/v1 in Netlify Functions (server/, netlify/functions/api.mjs), browser has no Supabase keys, History API router. Needs Netlify secrets SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL (user adds them). Phase 1 document (RACI, diagrams, DER, endpoints, OWASP) due 2026-09-27 — user asked to do it after technical compliance.

**Why:** dashboard-only settings (exposed schemas, auth config, users) cannot be changed through the MCP; the user does them by hand, guided step by step.
**How to apply:** when deploying to production, the user must add the production URL to Auth → URL Configuration. Never ask for or use passwords or personal access tokens; guide the user through dashboard clicks instead.
