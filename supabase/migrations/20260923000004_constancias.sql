-- Datos de la empresa (encabezado de documentos) y registro de constancias emitidas

create table empresa.configuracion (
  id               int primary key default 1 check (id = 1),
  nombre           text,
  nit              text,
  direccion        text,
  telefono         text,
  correo           text,
  ciudad           text not null default 'Guatemala',
  firmante_nombre  text,
  firmante_cargo   text,
  updated_at       timestamptz not null default now()
);
insert into empresa.configuracion (id) values (1);

alter table empresa.configuracion enable row level security;
create policy todos_ver on empresa.configuracion for select to authenticated using (true);
create policy rrhh_editar on empresa.configuracion for update to authenticated
  using (public.tiene_rol('admin', 'rrhh')) with check (public.tiene_rol('admin', 'rrhh'));

create table empresa.constancias (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references empresa.empleados (id) on delete cascade,
  tipo         text not null check (tipo in ('laboral', 'ingresos')),
  codigo       text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 10)),
  dirigida_a   text,
  emitida_por  uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index on empresa.constancias (empleado_id);

alter table empresa.constancias enable row level security;
create policy gestion_total on empresa.constancias for all to authenticated
  using (public.tiene_rol('admin', 'rrhh', 'nomina'))
  with check (public.tiene_rol('admin', 'rrhh', 'nomina'));
create policy propio_ver on empresa.constancias for select to authenticated
  using (empleado_id = public.empleado_actual());
create policy propio_solicitar on empresa.constancias for insert to authenticated
  with check (empleado_id = public.empleado_actual());

grant select, update on empresa.configuracion to authenticated;
grant select, insert, update, delete on empresa.constancias to authenticated;
grant all on empresa.configuracion, empresa.constancias to service_role;

create trigger aud_configuracion after update on empresa.configuracion
  for each row execute function empresa.registrar_auditoria();

-- Los parámetros de nómina son tasas legales; cualquier usuario puede leerlos
-- (la constancia de ingresos del empleado necesita la bonificación incentivo)
create policy todos_ver on empresa.parametros_nomina for select to authenticated using (true);
