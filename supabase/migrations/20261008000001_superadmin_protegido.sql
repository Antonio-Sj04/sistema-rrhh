-- Superadministrador: un perfil marcado como "protegido" no puede ser
-- eliminado, desactivado ni cambiado de rol por otros administradores.
-- La regla vive en la base de datos, así que se cumple aunque alguien use
-- la API, el panel de Supabase (Authentication) o la clave service_role.
alter table public.perfiles add column if not exists protegido boolean not null default false;

comment on column public.perfiles.protegido is
  'Superadministrador: nadie más puede eliminarlo ni modificarlo. Solo se cambia desde el editor SQL de Supabase.';

create or replace function public.proteger_superadmin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Editor SQL del panel de Supabase / migraciones: sesión postgres sin JWT
  desde_panel boolean := session_user = 'postgres' and auth.role() is null;
begin
  if tg_op = 'DELETE' then
    if old.protegido then
      raise exception 'Este usuario es superadministrador y no se puede eliminar.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.protegido is distinct from old.protegido and not desde_panel then
    raise exception 'La protección de superadministrador solo se cambia desde el panel de Supabase.' using errcode = 'P0001';
  end if;

  if old.protegido and not desde_panel and auth.uid() is distinct from old.id then
    raise exception 'Este usuario es superadministrador: solo él puede modificar su perfil.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_superadmin() from public, anon, authenticated;

drop trigger if exists proteger_superadmin on public.perfiles;
create trigger proteger_superadmin
  before update or delete on public.perfiles
  for each row execute function public.proteger_superadmin();
