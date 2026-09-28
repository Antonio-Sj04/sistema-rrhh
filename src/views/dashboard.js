import { obtenerPerfil, tieneRol } from '../auth.js';
import { ETAPAS } from '../catalogos.js';
import { tarjetaGrafica } from '../graficas.js';
import { icono } from '../layout.js';
import { api, empresa, ok, reclutamiento } from '../api.js';
import { badge, esc, fecha, moneda, nombreCompleto, porId, tabla } from '../ui.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monedaCorta = (n) => `Q${new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 }).format(n)}`;
const entero = (n) => new Intl.NumberFormat('es-GT').format(n);

/** Últimos 12 meses como claves 'AAAA-MM' y etiquetas 'sep 26'. */
function ultimosMeses(n = 12) {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (n - 1 - i), 1);
    return {
      clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    };
  });
}

export async function render(el) {
  const perfil = obtenerPerfil();
  const verReclutamiento = tieneRol('admin', 'rrhh', 'jefe');
  const verNomina = tieneRol('admin', 'rrhh', 'nomina');
  const meses = ultimosMeses();

  const [resumen, periodos, solicitudes, empleados, departamentos, postulaciones] =
    await Promise.all([
      // Indicadores: GET /api/v1/reportes/resumen (consulta SQL directa con RLS)
      api('/reportes/resumen').then((r) => r.datos).catch(() => ({})),
      verNomina
        ? ok(
            empresa('periodos_nomina')
              .select('id, nombre, tipo, fecha_inicio, recibos_nomina(liquido, total_ingresos, igss_patronal, irtra, intecap)')
              .neq('estado', 'borrador')
              .order('fecha_inicio', { ascending: false })
              .limit(24),
          )
        : [],
      ok(
        empresa('ausencias')
          .select('id, tipo, fecha_inicio, fecha_fin, dias, estado, empleado:empleados(nombres, apellidos)')
          .eq('estado', 'pendiente')
          .order('created_at')
          .limit(6),
      ),
      ok(empresa('empleados').select('departamento_id, estado, fecha_ingreso, fecha_baja')),
      ok(empresa('departamentos').select('id, nombre')),
      verReclutamiento
        ? ok(reclutamiento('postulaciones').select('etapa, vacante:vacantes(estado)'))
        : [],
    ]);

  const activos = resumen.empleados_activos;
  const pendientes = resumen.ausencias_pendientes;
  const vacantes = verReclutamiento ? resumen.vacantes_abiertas : null;
  const postulantesMes = verReclutamiento ? resumen.postulaciones_mes : null;

  const suma = (p, campos) => p.recibos_nomina.reduce((s, r) => s + campos.reduce((t, c) => t + Number(r[c]), 0), 0);
  const ultimaNomina = periodos.find((p) => p.tipo === 'mensual') ?? periodos[0];

  const kpi = (etiqueta, valor, nota, href, simbolo, tono) =>
    valor == null
      ? ''
      : `<a class="tarjeta kpi" href="${href}">
          <div class="kpi-cabecera"><span class="kpi-icono tono-${tono}">${icono(simbolo)}</span><span class="kpi-nota">${esc(nota)}</span></div>
          <div class="kpi-valor">${esc(valor)}</div>
          <div class="kpi-etiqueta">${esc(etiqueta)}</div></a>`;

  const hoyLargo = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const primerNombre = (perfil.nombre ?? perfil.email).split(/\s+/)[0];

  el.innerHTML = `
    <div class="encabezado saludo">
      <div><div class="saludo-fecha">${esc(hoyLargo.charAt(0).toUpperCase() + hoyLargo.slice(1))}</div>
      <h1>Hola, ${esc(primerNombre)} <span aria-hidden="true">👋</span></h1>
      <p>Aquí tienes lo que está pasando hoy en la empresa.</p></div>
    </div>
    <div class="rejilla rejilla-kpi" style="margin-bottom:16px">
      ${kpi('Empleados activos', activos, 'Plantilla', '/empleados', 'empleados', 'indigo')}
      ${kpi('Solicitudes pendientes', pendientes, 'Por aprobar', '/ausencias', 'ausencias', 'ambar')}
      ${kpi('Vacantes abiertas', vacantes, 'Reclutando', '/vacantes', 'vacantes', 'verde')}
      ${kpi('Postulaciones del mes', postulantesMes, 'Este mes', '/proceso', 'proceso', 'fucsia')}
      ${ultimaNomina ? kpi('Última nómina', moneda(suma(ultimaNomina, ['liquido'])), ultimaNomina.nombre, `/nomina/${ultimaNomina.id}`, 'nomina', 'cielo') : ''}
    </div>
    <div class="rejilla rejilla-graficas">
      ${verNomina ? '<div class="tarjeta" id="g-planilla"></div>' : ''}
      <div class="tarjeta" id="g-rotacion"></div>
      <div class="tarjeta" id="g-departamentos"></div>
      ${verReclutamiento ? '<div class="tarjeta" id="g-reclutamiento"></div>' : ''}
    </div>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Solicitudes por aprobar</h2><a href="/ausencias">Ver todas</a></div>
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

  // 1. Costo de planilla mensual (líquido + cuotas patronales)
  if (verNomina) {
    const mensuales = periodos.filter((p) => p.tipo === 'mensual').slice(0, 12).reverse();
    tarjetaGrafica(el.querySelector('#g-planilla'), {
      tipo: 'columnas',
      titulo: 'Costo de planilla por mes',
      subtitulo: 'Ingresos del personal + cuotas patronales (IGSS, IRTRA, INTECAP)',
      categorias: mensuales.map((p) => {
        const [a, m] = p.fecha_inicio.split('-');
        return `${MESES[Number(m) - 1]} ${a.slice(2)}`;
      }),
      valores: mensuales.map((p) => Math.round(suma(p, ['total_ingresos', 'igss_patronal', 'irtra', 'intecap']))),
      formato: monedaCorta,
      vacio: 'Aparecerá cuando calcules tu primera nómina mensual.',
    });
  }

  // 2. Rotación: altas y bajas de los últimos 12 meses
  const porMes = (campo) => meses.map((m) => empleados.filter((e) => e[campo]?.startsWith(m.clave)).length);
  tarjetaGrafica(el.querySelector('#g-rotacion'), {
    tipo: 'columnas',
    titulo: 'Altas y bajas de personal',
    subtitulo: 'Últimos 12 meses',
    categorias: meses.map((m) => m.etiqueta),
    series: [
      { nombre: 'Altas', valores: porMes('fecha_ingreso'), color: '--viz-serie-1' },
      { nombre: 'Bajas', valores: porMes('fecha_baja'), color: '--viz-serie-2' },
    ],
    formato: entero,
    vacio: 'Sin ingresos ni bajas en los últimos 12 meses.',
  });

  // 3. Personal activo por departamento
  const deptos = porId(departamentos);
  const conteo = {};
  for (const e of empleados.filter((x) => x.estado === 'activo')) {
    const nombre = deptos[e.departamento_id]?.nombre ?? 'Sin departamento';
    conteo[nombre] = (conteo[nombre] ?? 0) + 1;
  }
  const ordenDeptos = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  tarjetaGrafica(el.querySelector('#g-departamentos'), {
    tipo: 'barras',
    titulo: 'Personal activo por departamento',
    categorias: ordenDeptos.map(([n]) => n),
    valores: ordenDeptos.map(([, v]) => v),
    formato: entero,
    vacio: 'Aún no hay empleados activos.',
  });

  // 4. Candidatos por etapa en vacantes abiertas o pausadas
  if (verReclutamiento) {
    const activas = postulaciones.filter((p) => p.vacante && p.vacante.estado !== 'cerrada');
    tarjetaGrafica(el.querySelector('#g-reclutamiento'), {
      tipo: 'barras',
      titulo: 'Candidatos por etapa',
      subtitulo: 'Vacantes abiertas y pausadas',
      categorias: ETAPAS.map(([, t]) => t),
      valores: ETAPAS.map(([v]) => activas.filter((p) => p.etapa === v).length),
      formato: entero,
      vacio: 'No hay candidatos en procesos activos.',
    });
  }
}
