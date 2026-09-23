-- Datos iniciales de ejemplo (opcional)
insert into empresa.departamentos (nombre, descripcion) values
  ('Recursos Humanos', 'Gestión de personal y reclutamiento'),
  ('Finanzas', 'Contabilidad, nómina y tesorería'),
  ('Operaciones', 'Producción y logística'),
  ('Tecnología', 'Sistemas e infraestructura')
on conflict (nombre) do nothing;

insert into empresa.puestos (nombre, departamento_id, salario_min, salario_max)
select p.nombre, d.id, p.min, p.max
from (values
  ('Analista de RRHH', 'Recursos Humanos', 6000, 9000),
  ('Contador', 'Finanzas', 7000, 11000),
  ('Operario', 'Operaciones', 3800, 5000),
  ('Desarrollador', 'Tecnología', 9000, 16000)
) as p(nombre, depto, min, max)
join empresa.departamentos d on d.nombre = p.depto
on conflict do nothing;

-- Para convertir tu primer usuario en administrador (reemplaza el correo):
-- update public.perfiles set rol = 'admin' where email = 'tu-correo@ejemplo.com';
