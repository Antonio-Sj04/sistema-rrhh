-- Liquidación laboral al dar de baja a un empleado

-- Fracción del aguinaldo y del Bono 14 que se suma al salario para indemnizar
alter table empresa.parametros_nomina
  add column indemnizacion_fraccion_prestaciones numeric(8, 6) not null default 0.166667;

create table empresa.liquidaciones (
  id                uuid primary key default gen_random_uuid(),
  empleado_id       uuid not null unique references empresa.empleados (id) on delete cascade,
  fecha_baja        date not null,
  motivo            text not null check (motivo in ('renuncia', 'despido_injustificado', 'despido_indirecto',
                                                    'despido_justificado', 'fin_contrato', 'mutuo_acuerdo', 'otro')),
  salario_base      numeric(12, 2) not null,
  dias_laborados    int not null,
  dias_vacaciones   numeric(6, 2) not null default 0,
  ingresos          jsonb not null default '[]',
  descuentos        jsonb not null default '[]',
  total_ingresos    numeric(12, 2) not null,
  total_descuentos  numeric(12, 2) not null,
  total             numeric(12, 2) not null,
  observaciones     text,
  pagada            boolean not null default false,
  created_by        uuid references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now()
);

alter table empresa.liquidaciones enable row level security;
create policy gestion_total on empresa.liquidaciones for all to authenticated
  using (public.tiene_rol('admin', 'rrhh', 'nomina'))
  with check (public.tiene_rol('admin', 'rrhh', 'nomina'));
create policy propio_ver on empresa.liquidaciones for select to authenticated
  using (empleado_id = public.empleado_actual());

grant select, insert, update, delete on empresa.liquidaciones to authenticated;
grant all on empresa.liquidaciones to service_role;

create trigger aud_liquidaciones after insert or update or delete on empresa.liquidaciones
  for each row execute function empresa.registrar_auditoria();
