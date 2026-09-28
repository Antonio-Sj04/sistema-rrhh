-- RLS explícito en todas las tablas: envios_portal solo lo usa la API con
-- service_role (que omite RLS). Ningún usuario, anónimo o autenticado, puede
-- leer ni escribir los hashes de IP del portal.
create policy nadie_acceso on reclutamiento.envios_portal
  as restrictive for all to anon, authenticated
  using (false) with check (false);

comment on table reclutamiento.envios_portal is
  'Registro anónimo (hash SHA-256 de la IP) para limitar a 5 postulaciones por hora. Solo accesible desde la API con service_role.';
