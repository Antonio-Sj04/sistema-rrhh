-- Permitir eliminar usuarios sin perder registros de la empresa:
-- al borrar la cuenta, las referencias "quién lo hizo" quedan en NULL.
alter table empresa.ausencias drop constraint ausencias_aprobado_por_fkey,
  add constraint ausencias_aprobado_por_fkey foreign key (aprobado_por) references auth.users (id) on delete set null;

alter table empresa.evaluaciones drop constraint evaluaciones_evaluador_id_fkey,
  add constraint evaluaciones_evaluador_id_fkey foreign key (evaluador_id) references auth.users (id) on delete set null;

alter table empresa.periodos_nomina drop constraint periodos_nomina_created_by_fkey,
  add constraint periodos_nomina_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

alter table empresa.liquidaciones drop constraint liquidaciones_created_by_fkey,
  add constraint liquidaciones_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

alter table empresa.constancias drop constraint constancias_emitida_por_fkey,
  add constraint constancias_emitida_por_fkey foreign key (emitida_por) references auth.users (id) on delete set null;
