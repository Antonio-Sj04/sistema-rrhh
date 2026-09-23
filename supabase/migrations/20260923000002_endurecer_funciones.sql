-- Recomendaciones del asesor de seguridad de Supabase
alter function public.tocar_updated_at() set search_path = '';
alter function empresa.bloquear_periodo_cerrado() set search_path = '';

-- La función del trigger no debe poder llamarse por la API
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- Las funciones de rol solo las usan usuarios autenticados (RLS y Edge Function)
revoke execute on function public.tiene_rol(text[]) from public, anon;
revoke execute on function public.empleado_actual() from public, anon;
grant execute on function public.tiene_rol(text[]) to authenticated, service_role;
grant execute on function public.empleado_actual() to authenticated, service_role;
