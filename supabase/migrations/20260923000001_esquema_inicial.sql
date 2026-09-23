-- =====================================================================
-- Sistema de Recursos Humanos
-- Dos bases de datos lógicas dentro del mismo proyecto Supabase:
--   * empresa        → empleados, contratos, nómina, ausencias, etc.
--   * reclutamiento  → vacantes, postulantes, CV, antecedentes, etc.
-- Los perfiles de usuario y roles viven en "public".
-- =====================================================================

create schema if not exists empresa;
create schema if not exists reclutamiento;

-- ---------------------------------------------------------------------
-- 1. Usuarios, roles y funciones de ayuda
-- ---------------------------------------------------------------------
create type public.rol_usuario as enum ('admin', 'rrhh', 'nomina', 'jefe', 'empleado');

create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nombre      text,
  rol         public.rol_usuario not null default 'empleado',
  empleado_id uuid,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ¿El usuario actual tiene alguno de estos roles?
create or replace function public.tiene_rol(variadic roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.rol::text = any (roles) from public.perfiles p where p.id = auth.uid() and p.activo),
    false
  );
$$;

-- Empleado vinculado al usuario actual
create or replace function public.empleado_actual()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.empleado_id from public.perfiles p where p.id = auth.uid() and p.activo;
$$;

-- Crea el perfil automáticamente cuando se registra/invita un usuario
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- updated_at genérico
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. ESQUEMA EMPRESA
-- ---------------------------------------------------------------------
create table empresa.departamentos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  jefe_id     uuid,
  created_at  timestamptz not null default now()
);

create table empresa.puestos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  departamento_id uuid references empresa.departamentos (id) on delete set null,
  salario_min     numeric(12, 2),
  salario_max     numeric(12, 2),
  descripcion     text,
  created_at      timestamptz not null default now(),
  unique (nombre, departamento_id)
);

create sequence empresa.empleado_codigo_seq;

create table empresa.empleados (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique default ('EMP-' || lpad(nextval('empresa.empleado_codigo_seq')::text, 5, '0')),
  nombres          text not null,
  apellidos        text not null,
  dpi              text unique check (dpi ~ '^\d{13}$'),
  nit              text,
  afiliacion_igss  text,
  fecha_nacimiento date,
  genero           text check (genero in ('M', 'F', 'O')),
  estado_civil     text,
  email            text,
  telefono         text,
  direccion        text,
  departamento_id  uuid references empresa.departamentos (id) on delete set null,
  puesto_id        uuid references empresa.puestos (id) on delete set null,
  jefe_id          uuid references empresa.empleados (id) on delete set null,
  fecha_ingreso    date not null default current_date,
  fecha_baja       date,
  motivo_baja      text,
  estado           text not null default 'activo' check (estado in ('activo', 'suspendido', 'baja')),
  salario_base     numeric(12, 2) not null default 0 check (salario_base >= 0),
  banco            text,
  cuenta_bancaria  text,
  contacto_emergencia text,
  telefono_emergencia text,
  postulante_id    uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on empresa.empleados (departamento_id);
create index on empresa.empleados (estado);
create trigger empleados_updated before update on empresa.empleados
  for each row execute function public.tocar_updated_at();

alter table empresa.departamentos
  add constraint departamentos_jefe_fk foreign key (jefe_id) references empresa.empleados (id) on delete set null;
alter table public.perfiles
  add constraint perfiles_empleado_fk foreign key (empleado_id) references empresa.empleados (id) on delete set null;

create table empresa.contratos (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references empresa.empleados (id) on delete cascade,
  tipo         text not null default 'indefinido' check (tipo in ('indefinido', 'plazo_fijo', 'obra_determinada')),
  jornada      text not null default 'diurna' check (jornada in ('diurna', 'nocturna', 'mixta')),
  fecha_inicio date not null,
  fecha_fin    date,
  salario      numeric(12, 2) not null,
  observaciones text,
  created_at   timestamptz not null default now()
);
create index on empresa.contratos (empleado_id);

create table empresa.ausencias (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references empresa.empleados (id) on delete cascade,
  tipo          text not null check (tipo in ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'suspension_igss', 'falta')),
  fecha_inicio  date not null,
  fecha_fin     date not null,
  dias          numeric(5, 1) not null default 1,
  motivo        text,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  aprobado_por  uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);
create index on empresa.ausencias (empleado_id);
create index on empresa.ausencias (estado);

create table empresa.evaluaciones (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references empresa.empleados (id) on delete cascade,
  evaluador_id uuid references auth.users (id) default auth.uid(),
  periodo      text not null,
  calificacion int not null check (calificacion between 1 and 5),
  fortalezas   text,
  mejoras      text,
  fecha        date not null default current_date
);

create table empresa.documentos_empleado (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empresa.empleados (id) on delete cascade,
  tipo        text not null,
  nombre      text not null,
  ruta        text not null,
  created_at  timestamptz not null default now()
);

-- Parámetros de nómina (Guatemala). Fila única, editable por admin/nómina.
create table empresa.parametros_nomina (
  id                     int primary key default 1 check (id = 1),
  igss_laboral           numeric(6, 4) not null default 0.0483,
  igss_patronal          numeric(6, 4) not null default 0.1067,
  irtra                  numeric(6, 4) not null default 0.0100,
  intecap                numeric(6, 4) not null default 0.0100,
  bonificacion_incentivo numeric(12, 2) not null default 250,
  isr_deduccion_fija     numeric(12, 2) not null default 48000,
  isr_tramo              numeric(12, 2) not null default 300000,
  isr_tasa1              numeric(6, 4) not null default 0.05,
  isr_tasa2              numeric(6, 4) not null default 0.07,
  salario_minimo         numeric(12, 2),
  updated_at             timestamptz not null default now()
);
insert into empresa.parametros_nomina (id) values (1);

create table empresa.periodos_nomina (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  tipo         text not null default 'mensual' check (tipo in ('mensual', 'aguinaldo', 'bono14')),
  fecha_inicio date not null,
  fecha_fin    date not null,
  fecha_pago   date,
  estado       text not null default 'borrador' check (estado in ('borrador', 'calculada', 'cerrada')),
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table empresa.recibos_nomina (
  id                      uuid primary key default gen_random_uuid(),
  periodo_id              uuid not null references empresa.periodos_nomina (id) on delete cascade,
  empleado_id             uuid not null references empresa.empleados (id) on delete restrict,
  salario_base            numeric(12, 2) not null default 0,
  dias_laborados          numeric(5, 2) not null default 30,
  salario_devengado       numeric(12, 2) not null default 0,
  horas_extra             numeric(6, 2) not null default 0,
  monto_horas_extra       numeric(12, 2) not null default 0,
  bonificacion_incentivo  numeric(12, 2) not null default 0,
  otros_ingresos          numeric(12, 2) not null default 0,
  total_ingresos          numeric(12, 2) not null default 0,
  igss_laboral            numeric(12, 2) not null default 0,
  isr                     numeric(12, 2) not null default 0,
  otros_descuentos        numeric(12, 2) not null default 0,
  total_descuentos        numeric(12, 2) not null default 0,
  liquido                 numeric(12, 2) not null default 0,
  igss_patronal           numeric(12, 2) not null default 0,
  irtra                   numeric(12, 2) not null default 0,
  intecap                 numeric(12, 2) not null default 0,
  created_at              timestamptz not null default now(),
  unique (periodo_id, empleado_id)
);

-- Impide modificar recibos de un período cerrado
create or replace function empresa.bloquear_periodo_cerrado()
returns trigger language plpgsql as $$
declare v_estado text;
begin
  select estado into v_estado from empresa.periodos_nomina
   where id = coalesce(new.periodo_id, old.periodo_id);
  if v_estado = 'cerrada' then
    raise exception 'El período de nómina está cerrado y no puede modificarse';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger recibos_bloqueo before insert or update or delete on empresa.recibos_nomina
  for each row execute function empresa.bloquear_periodo_cerrado();

-- Bitácora de auditoría
create table empresa.auditoria (
  id           bigint generated always as identity primary key,
  esquema      text not null,
  tabla        text not null,
  operacion    text not null,
  registro_id  text,
  antes        jsonb,
  despues      jsonb,
  usuario_id   uuid default auth.uid(),
  fecha        timestamptz not null default now()
);

create or replace function empresa.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into empresa.auditoria (esquema, tabla, operacion, registro_id, antes, despues, usuario_id)
  values (
    tg_table_schema, tg_table_name, tg_op,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ESQUEMA RECLUTAMIENTO
-- ---------------------------------------------------------------------
create table reclutamiento.vacantes (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  departamento_id  uuid references empresa.departamentos (id) on delete set null,
  puesto_id        uuid references empresa.puestos (id) on delete set null,
  descripcion      text,
  requisitos       text,
  salario_ofrecido numeric(12, 2),
  plazas           int not null default 1 check (plazas > 0),
  estado           text not null default 'abierta' check (estado in ('abierta', 'pausada', 'cerrada')),
  fecha_apertura   date not null default current_date,
  fecha_cierre     date,
  created_at       timestamptz not null default now()
);

create table reclutamiento.postulantes (
  id                    uuid primary key default gen_random_uuid(),
  nombres               text not null,
  apellidos             text not null,
  dpi                   text check (dpi ~ '^\d{13}$'),
  email                 text,
  telefono              text,
  direccion             text,
  fecha_nacimiento      date,
  nivel_academico       text,
  profesion             text,
  anios_experiencia     numeric(4, 1),
  pretension_salarial   numeric(12, 2),
  fuente                text check (fuente in ('referido', 'bolsa_empleo', 'redes_sociales', 'universidad', 'otro')),
  cv_ruta               text,
  consentimiento_datos  boolean not null default false,
  fecha_consentimiento  date,
  notas                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index postulantes_dpi_unico on reclutamiento.postulantes (dpi) where dpi is not null;
create trigger postulantes_updated before update on reclutamiento.postulantes
  for each row execute function public.tocar_updated_at();

alter table empresa.empleados
  add constraint empleados_postulante_fk foreign key (postulante_id) references reclutamiento.postulantes (id) on delete set null;

create table reclutamiento.educacion (
  id            uuid primary key default gen_random_uuid(),
  postulante_id uuid not null references reclutamiento.postulantes (id) on delete cascade,
  institucion   text not null,
  titulo        text not null,
  nivel         text,
  anio_inicio   int,
  anio_fin      int
);

create table reclutamiento.experiencia (
  id            uuid primary key default gen_random_uuid(),
  postulante_id uuid not null references reclutamiento.postulantes (id) on delete cascade,
  empresa       text not null,
  puesto        text not null,
  fecha_inicio  date,
  fecha_fin     date,
  funciones     text
);

create table reclutamiento.referencias (
  id            uuid primary key default gen_random_uuid(),
  postulante_id uuid not null references reclutamiento.postulantes (id) on delete cascade,
  nombre        text not null,
  relacion      text,
  empresa       text,
  telefono      text,
  verificada    boolean not null default false,
  comentarios   text
);

create table reclutamiento.antecedentes (
  id             uuid primary key default gen_random_uuid(),
  postulante_id  uuid not null references reclutamiento.postulantes (id) on delete cascade,
  tipo           text not null check (tipo in ('penales', 'policiacos', 'renas', 'referencias_laborales', 'buro_credito', 'otro')),
  fecha_emision  date,
  resultado      text not null default 'pendiente' check (resultado in ('pendiente', 'sin_registro', 'con_registro')),
  documento_ruta text,
  observaciones  text,
  created_at     timestamptz not null default now()
);

create table reclutamiento.postulaciones (
  id             uuid primary key default gen_random_uuid(),
  postulante_id  uuid not null references reclutamiento.postulantes (id) on delete cascade,
  vacante_id     uuid not null references reclutamiento.vacantes (id) on delete cascade,
  etapa          text not null default 'aplicado'
                 check (etapa in ('aplicado', 'filtro', 'entrevista', 'pruebas', 'oferta', 'contratado', 'rechazado')),
  calificacion   int check (calificacion between 1 and 5),
  motivo_rechazo text,
  created_at     timestamptz not null default now(),
  unique (postulante_id, vacante_id)
);
create index on reclutamiento.postulaciones (vacante_id, etapa);

create table reclutamiento.entrevistas (
  id              uuid primary key default gen_random_uuid(),
  postulacion_id  uuid not null references reclutamiento.postulaciones (id) on delete cascade,
  fecha_hora      timestamptz not null,
  tipo            text not null default 'presencial' check (tipo in ('telefonica', 'presencial', 'virtual', 'tecnica')),
  entrevistador_id uuid references empresa.empleados (id) on delete set null,
  estado          text not null default 'programada' check (estado in ('programada', 'realizada', 'cancelada')),
  calificacion    int check (calificacion between 1 and 5),
  comentarios     text
);

-- Convierte una postulación en empleado (copia datos a la base "empresa")
create or replace function reclutamiento.contratar(
  p_postulacion   uuid,
  p_puesto        uuid,
  p_departamento  uuid,
  p_salario       numeric,
  p_fecha_ingreso date
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_p   reclutamiento.postulantes;
  v_emp uuid;
begin
  if not public.tiene_rol('admin', 'rrhh') then
    raise exception 'No autorizado';
  end if;

  select p.* into v_p
    from reclutamiento.postulaciones po
    join reclutamiento.postulantes p on p.id = po.postulante_id
   where po.id = p_postulacion;
  if not found then
    raise exception 'Postulación no encontrada';
  end if;

  insert into empresa.empleados (nombres, apellidos, dpi, email, telefono, direccion, fecha_nacimiento,
                                 departamento_id, puesto_id, salario_base, fecha_ingreso, postulante_id)
  values (v_p.nombres, v_p.apellidos, v_p.dpi, v_p.email, v_p.telefono, v_p.direccion, v_p.fecha_nacimiento,
          p_departamento, p_puesto, p_salario, p_fecha_ingreso, v_p.id)
  returning id into v_emp;

  insert into empresa.contratos (empleado_id, tipo, fecha_inicio, salario)
  values (v_emp, 'indefinido', p_fecha_ingreso, p_salario);

  update reclutamiento.postulaciones set etapa = 'contratado' where id = p_postulacion;
  return v_emp;
end;
$$;

-- Elimina postulantes antiguos sin procesos activos (retención de datos personales)
create or replace function reclutamiento.purgar_postulantes(p_meses int default 24)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_total int;
begin
  delete from reclutamiento.postulantes p
   where p.created_at < now() - make_interval(months => p_meses)
     and not exists (select 1 from empresa.empleados e where e.postulante_id = p.id)
     and not exists (select 1 from reclutamiento.postulaciones po
                      where po.postulante_id = p.id
                        and po.etapa not in ('contratado', 'rechazado'));
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;
revoke execute on function reclutamiento.purgar_postulantes(int) from public, authenticated;

-- ¿El jefe actual dirige el departamento de esta vacante?
create or replace function reclutamiento.vacante_de_mi_depto(p_vacante uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from reclutamiento.vacantes v
      join empresa.departamentos d on d.id = v.departamento_id
     where v.id = p_vacante and d.jefe_id = public.empleado_actual()
  );
$$;

-- ¿El empleado pertenece al equipo del jefe actual?
create or replace function empresa.es_de_mi_equipo(p_empleado uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from empresa.empleados e
      left join empresa.departamentos d on d.id = e.departamento_id
     where e.id = p_empleado
       and (e.jefe_id = public.empleado_actual() or d.jefe_id = public.empleado_actual())
  );
$$;

-- Triggers de auditoría
create trigger aud_empleados     after insert or update or delete on empresa.empleados        for each row execute function empresa.registrar_auditoria();
create trigger aud_contratos     after insert or update or delete on empresa.contratos        for each row execute function empresa.registrar_auditoria();
create trigger aud_periodos      after insert or update or delete on empresa.periodos_nomina  for each row execute function empresa.registrar_auditoria();
create trigger aud_parametros    after update on empresa.parametros_nomina                     for each row execute function empresa.registrar_auditoria();
create trigger aud_postulantes   after insert or update or delete on reclutamiento.postulantes for each row execute function empresa.registrar_auditoria();
create trigger aud_antecedentes  after insert or update or delete on reclutamiento.antecedentes for each row execute function empresa.registrar_auditoria();
create trigger aud_perfiles      after update on public.perfiles                               for each row execute function empresa.registrar_auditoria();

-- ---------------------------------------------------------------------
-- 4. Permisos (GRANT) — RLS se encarga del filtrado fino
-- ---------------------------------------------------------------------
grant select, update on public.perfiles to authenticated;
grant all on public.perfiles to service_role;
grant usage on schema empresa, reclutamiento to authenticated, service_role;
grant select, insert, update, delete on all tables in schema empresa, reclutamiento to authenticated;
grant all on all tables in schema empresa, reclutamiento to service_role;
grant usage, select on all sequences in schema empresa, reclutamiento to authenticated, service_role;
grant execute on function reclutamiento.contratar(uuid, uuid, uuid, numeric, date) to authenticated;
revoke all on empresa.auditoria from authenticated;
grant select on empresa.auditoria to authenticated;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.tiene_rol('admin', 'rrhh'));
create policy perfiles_admin on public.perfiles for update to authenticated
  using (public.tiene_rol('admin')) with check (public.tiene_rol('admin'));

-- Acceso total para admin y RRHH en tablas de personal y reclutamiento
do $$
declare t text;
begin
  foreach t in array array[
    'empresa.departamentos', 'empresa.puestos', 'empresa.empleados', 'empresa.contratos',
    'empresa.ausencias', 'empresa.evaluaciones', 'empresa.documentos_empleado',
    'reclutamiento.vacantes', 'reclutamiento.postulantes', 'reclutamiento.educacion',
    'reclutamiento.experiencia', 'reclutamiento.referencias', 'reclutamiento.antecedentes',
    'reclutamiento.postulaciones', 'reclutamiento.entrevistas'
  ] loop
    execute format('alter table %s enable row level security', t);
    execute format(
      'create policy rrhh_total on %s for all to authenticated
         using (public.tiene_rol(''admin'', ''rrhh''))
         with check (public.tiene_rol(''admin'', ''rrhh''))', t);
  end loop;

  -- Tablas de nómina: acceso total para admin y nómina, lectura para RRHH
  foreach t in array array['empresa.parametros_nomina', 'empresa.periodos_nomina', 'empresa.recibos_nomina'] loop
    execute format('alter table %s enable row level security', t);
    execute format(
      'create policy nomina_total on %s for all to authenticated
         using (public.tiene_rol(''admin'', ''nomina''))
         with check (public.tiene_rol(''admin'', ''nomina''))', t);
    execute format(
      'create policy rrhh_lectura on %s for select to authenticated
         using (public.tiene_rol(''rrhh''))', t);
  end loop;
end $$;

alter table empresa.auditoria enable row level security;
create policy auditoria_admin on empresa.auditoria for select to authenticated
  using (public.tiene_rol('admin'));

-- Catálogos visibles para cualquier usuario autenticado
create policy catalogo_ver on empresa.departamentos for select to authenticated using (true);
create policy catalogo_ver on empresa.puestos       for select to authenticated using (true);

-- Empleados
create policy nomina_ver on empresa.empleados for select to authenticated
  using (public.tiene_rol('nomina'));
create policy jefe_ver on empresa.empleados for select to authenticated
  using (public.tiene_rol('jefe') and empresa.es_de_mi_equipo(id));
create policy propio_ver on empresa.empleados for select to authenticated
  using (id = public.empleado_actual());

create policy nomina_ver on empresa.contratos for select to authenticated
  using (public.tiene_rol('nomina'));
create policy propio_ver on empresa.contratos for select to authenticated
  using (empleado_id = public.empleado_actual());

-- Recibos: cada empleado ve los suyos cuando el período está cerrado
create policy propio_ver on empresa.recibos_nomina for select to authenticated
  using (empleado_id = public.empleado_actual()
         and exists (select 1 from empresa.periodos_nomina p where p.id = periodo_id and p.estado = 'cerrada'));
create policy propio_ver on empresa.periodos_nomina for select to authenticated
  using (estado = 'cerrada');

-- Ausencias: el empleado solicita, el jefe aprueba
create policy propio_ver on empresa.ausencias for select to authenticated
  using (empleado_id = public.empleado_actual());
create policy propio_solicitar on empresa.ausencias for insert to authenticated
  with check (empleado_id = public.empleado_actual() and estado = 'pendiente');
create policy nomina_ver on empresa.ausencias for select to authenticated
  using (public.tiene_rol('nomina'));
create policy jefe_ver on empresa.ausencias for select to authenticated
  using (public.tiene_rol('jefe') and empresa.es_de_mi_equipo(empleado_id));
create policy jefe_aprobar on empresa.ausencias for update to authenticated
  using (public.tiene_rol('jefe') and empresa.es_de_mi_equipo(empleado_id))
  with check (public.tiene_rol('jefe') and empresa.es_de_mi_equipo(empleado_id));

-- Evaluaciones: el jefe evalúa a su equipo; el empleado ve las suyas
create policy jefe_gestionar on empresa.evaluaciones for all to authenticated
  using (public.tiene_rol('jefe') and empresa.es_de_mi_equipo(empleado_id))
  with check (public.tiene_rol('jefe') and empresa.es_de_mi_equipo(empleado_id));
create policy propio_ver on empresa.evaluaciones for select to authenticated
  using (empleado_id = public.empleado_actual());

create policy propio_ver on empresa.documentos_empleado for select to authenticated
  using (empleado_id = public.empleado_actual());

-- Reclutamiento: los jefes consultan los procesos de su departamento
create policy jefe_ver on reclutamiento.vacantes for select to authenticated
  using (public.tiene_rol('jefe') and reclutamiento.vacante_de_mi_depto(id));
create policy jefe_ver on reclutamiento.postulaciones for select to authenticated
  using (public.tiene_rol('jefe') and reclutamiento.vacante_de_mi_depto(vacante_id));
create policy jefe_ver on reclutamiento.postulantes for select to authenticated
  using (public.tiene_rol('jefe') and exists (
    select 1 from reclutamiento.postulaciones po
     where po.postulante_id = reclutamiento.postulantes.id
       and reclutamiento.vacante_de_mi_depto(po.vacante_id)));
create policy jefe_entrevistas on reclutamiento.entrevistas for select to authenticated
  using (entrevistador_id = public.empleado_actual());
create policy jefe_calificar on reclutamiento.entrevistas for update to authenticated
  using (entrevistador_id = public.empleado_actual())
  with check (entrevistador_id = public.empleado_actual());

-- ---------------------------------------------------------------------
-- 6. Storage (archivos privados)
--   cvs/{postulante_id}/...          → CV y antecedentes
--   documentos/{empleado_id}/...     → documentos del empleado
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cvs', 'cvs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy rrhh_archivos on storage.objects for all to authenticated
  using (bucket_id in ('cvs', 'documentos') and public.tiene_rol('admin', 'rrhh'))
  with check (bucket_id in ('cvs', 'documentos') and public.tiene_rol('admin', 'rrhh'));

create policy propio_documentos on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = public.empleado_actual()::text);
