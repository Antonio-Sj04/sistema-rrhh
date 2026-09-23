-- Al exponer los esquemas empresa y reclutamiento en la API, sus funciones
-- quedaron invocables sin sesión. Se restringen a usuarios autenticados y
-- las funciones de trigger dejan de ser invocables por la API.
revoke execute on function empresa.registrar_auditoria() from public, anon, authenticated;
revoke execute on function empresa.bloquear_periodo_cerrado() from public, anon, authenticated;
revoke execute on function empresa.es_de_mi_equipo(uuid) from public, anon;
revoke execute on function reclutamiento.vacante_de_mi_depto(uuid) from public, anon;
revoke execute on function reclutamiento.contratar(uuid, uuid, uuid, numeric, date) from public, anon;
grant execute on function empresa.es_de_mi_equipo(uuid) to authenticated, service_role;
grant execute on function reclutamiento.vacante_de_mi_depto(uuid) to authenticated, service_role;
grant execute on function reclutamiento.contratar(uuid, uuid, uuid, numeric, date) to authenticated, service_role;

-- Funciones futuras en estos esquemas no quedan abiertas por defecto
alter default privileges in schema empresa, reclutamiento revoke execute on functions from public, anon;
