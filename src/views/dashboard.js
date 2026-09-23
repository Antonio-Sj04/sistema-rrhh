import { obtenerPerfil, tieneRol } from '../auth.js';
import { empresa, ok, reclutamiento } from '../supabase.js';
import { badge, esc, fecha, moneda, nombreCompleto, tabla } from '../ui.js';

const contar = (consulta) => ok(consulta).catch(() => null);

export async function render(el) {
  const perfil = obtenerPerfil();
  const verReclutamiento = tieneRol('admin', 'rrhh', 'jefe');
  const verNomina = tieneRol('admin', 'rrhh', 'nomina');
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [activos, pendientes, vacantes, postulantesMes, ultimaNomina, solicitudes] = await Promise.all([
    contar(empresa('empleados').select('id', { count: 'exact', head: true }).eq('estado', 'activo')),
    contar(empresa('ausencias').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')),
    verReclutamiento
      ? contar(reclutamiento('vacantes').select('id', { count: 'exact', head: true }).eq('estado', 'abierta'))
      : null,
    verReclutamiento
      ? contar(reclutamiento('postulaciones').select('id', { count: 'exact', head: true }).gte('created_at', inicioMes))
      : null,
    verNomina
      ? ok(empresa('periodos_nomina').select('id, nombre, estado, recibos_nomina(liquido)').order('fecha_fin', { ascending: false }).limit(1)).then((r) => r[0])
      : null,
    ok(
      empresa('ausencias')
        .select('id, tipo, fecha_inicio, fecha_fin, dias, estado, empleado:empleados(nombres, apellidos)')
        .eq('estado', 'pendiente')
        .order('created_at')
        .limit(6),
    ),
  ]);

  const totalNomina = ultimaNomina?.recibos_nomina.reduce((s, r) => s + Number(r.liquido), 0);

  const kpi = (etiqueta, valor, nota = '', href = '') =>
    valor == null
      ? ''
      : `<a class="tarjeta kpi" href="${href}" style="color:inherit;text-decoration:none">
          <div class="kpi-etiqueta">${esc(etiqueta)}</div>
          <div class="kpi-valor">${esc(valor)}</div>
          <div class="kpi-nota">${esc(nota)}</div></a>`;

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Hola, ${esc(perfil.nombre ?? perfil.email)}</h1>
      <p>Resumen general al ${fecha(new Date().toISOString())}</p></div>
    </div>
    <div class="rejilla rejilla-kpi" style="margin-bottom:16px">
      ${kpi('Empleados activos', activos, 'Plantilla actual', '#/empleados')}
      ${kpi('Solicitudes pendientes', pendientes, 'Vacaciones y permisos', '#/ausencias')}
      ${kpi('Vacantes abiertas', vacantes, 'En reclutamiento', '#/vacantes')}
      ${kpi('Postulaciones del mes', postulantesMes, 'Nuevos candidatos', '#/proceso')}
      ${ultimaNomina ? kpi('Última nómina', moneda(totalNomina), ultimaNomina.nombre, `#/nomina/${ultimaNomina.id}`) : ''}
    </div>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Solicitudes por aprobar</h2><a href="#/ausencias">Ver todas</a></div>
      ${tabla(
        [
          { titulo: 'Empleado', render: (a) => esc(nombreCompleto(a.empleado)) },
          { titulo: 'Tipo', render: (a) => badge(a.tipo) },
          { titulo: 'Desde', render: (a) => fecha(a.fecha_inicio) },
          { titulo: 'Hasta', render: (a) => fecha(a.fecha_fin) },
          { titulo: 'Días', campo: 'dias', clase: 'numero' },
        ],
        solicitudes,
        { vacio: 'No hay solicitudes pendientes.' },
      )}
    </div>`;
}
