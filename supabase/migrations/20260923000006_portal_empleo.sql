-- Portal público de empleo
-- El público nunca accede a las tablas: lee vacantes con funciones de solo
-- lectura y postula a través de la Edge Function "postular" (service role).

-- Control de publicación por vacante
alter table reclutamiento.vacantes
  add column publicar boolean not null default true,
  add column publicar_salario boolean not null default false;

-- Cada postulación guarda el CV con el que se envió
alter table reclutamiento.postulaciones add column cv_ruta text;

-- Nueva fuente de candidatos
alter table reclutamiento.postulantes drop constraint postulantes_fuente_check;
alter table reclutamiento.postulantes add constraint postulantes_fuente_check
  check (fuente in ('referido', 'bolsa_empleo', 'redes_sociales', 'universidad', 'portal_empleo', 'otro'));

-- Registro de envíos para limitar abusos (solo lo usa la Edge Function)
create table reclutamiento.envios_portal (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);
create index on reclutamiento.envios_portal (ip_hash, created_at);
alter table reclutamiento.envios_portal enable row level security;
grant all on reclutamiento.envios_portal to service_role;

-- Vacantes visibles al público: solo campos publicables
create or replace function public.vacantes_publicas()
returns table (
  id uuid, titulo text, departamento text, descripcion text, requisitos text,
  salario numeric, plazas int, fecha_apertura date, fecha_cierre date
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.titulo, d.nombre, v.descripcion, v.requisitos,
         case when v.publicar_salario then v.salario_ofrecido end,
         v.plazas, v.fecha_apertura, v.fecha_cierre
    from reclutamiento.vacantes v
    left join empresa.departamentos d on d.id = v.departamento_id
   where v.estado = 'abierta'
     and v.publicar
     and (v.fecha_cierre is null or v.fecha_cierre >= current_date)
   order by v.fecha_apertura desc;
$$;

-- Nombre de la empresa para el encabezado del portal
create or replace function public.empresa_publica()
returns table (nombre text, ciudad text)
language sql stable security definer set search_path = ''
as $$
  select c.nombre, c.ciudad from empresa.configuracion c where c.id = 1;
$$;

revoke execute on function public.vacantes_publicas(), public.empresa_publica() from public;
grant execute on function public.vacantes_publicas(), public.empresa_publica() to anon, authenticated, service_role;
