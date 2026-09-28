// Bitácora: GET /api/v1/reportes/bitacora (SQL directo sobre las columnas
// JSONB "antes" y "despues" de empresa.auditoria).
import { api, ok, recurso } from '../api.js';
import { badge, esc, persona, etiqueta, fecha, modal, porId, tabla } from '../ui.js';

const OPERACIONES = { INSERT: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación' };
const COLOR_OPERACION = { INSERT: 'activo', UPDATE: 'info', DELETE: 'baja' }; // claves de color de badge()
const TABLAS = ['empleados', 'contratos', 'periodos_nomina', 'parametros_nomina', 'liquidaciones', 'postulantes', 'antecedentes', 'perfiles', 'usuarios'];

/** Avatar + nombre del usuario que hizo el cambio. */
function personaUsuario(nombre) {
  const [n, ...resto] = String(nombre).split(' ');
  return persona({ nombres: n, apellidos: resto.join(' ') });
}

const valorTexto = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export async function render(el) {
  el.innerHTML = `
    <div class="encabezado"><div><h1>Bitácora de auditoría</h1>
      <p>Registro de cambios en expedientes, contratos, nómina, postulantes y usuarios.</p></div></div>
    <div class="tarjeta">
      <form class="filtros" id="filtros">
        <input type="search" name="buscar" placeholder="Buscar dentro de los registros (nombre, DPI, correo…)" maxlength="80" />
        <select name="tabla"><option value="">Todas las tablas</option>
          ${TABLAS.map((t) => `<option value="${t}">${esc(etiqueta(t))}</option>`).join('')}</select>
        <select name="operacion"><option value="">Todas las operaciones</option>
          ${Object.entries(OPERACIONES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
      </form>
      <div id="lista"></div>
      <p class="texto-suave" id="origen" style="padding:0 20px 14px;font-size:12px"></p>
    </div>`;

  const perfiles = porId(await ok(recurso('perfiles').select('id, nombre, email')));
  const form = el.querySelector('#filtros');
  const lista = el.querySelector('#lista');
  let registros = [];

  async function cargar() {
    const f = new FormData(form);
    const r = await api('/reportes/bitacora', {
      parametros: { buscar: f.get('buscar'), tabla: f.get('tabla'), operacion: f.get('operacion'), limite: 200 },
    });
    registros = r.datos;
    el.querySelector('#origen').textContent = r.origen === 'sql'
      ? 'Consulta SQL directa a PostgreSQL con búsqueda en columnas JSONB.'
      : 'Consulta mediante la API de datos.';
    lista.innerHTML = tabla(
      [
        { titulo: 'Usuario', render: (x) => personaUsuario(perfiles[x.usuario_id]?.nombre ?? perfiles[x.usuario_id]?.email ?? (x.usuario_id ? 'Usuario eliminado' : 'Sistema')) },
        { titulo: 'Fecha', render: (x) => fecha(x.fecha, true) },
        { titulo: 'Operación', render: (x) => badge(COLOR_OPERACION[x.operacion], OPERACIONES[x.operacion]) },
        { titulo: 'Tabla', render: (x) => `<span title="${esc(`${x.esquema}.${x.tabla}`)}">${esc(etiqueta(x.tabla))}</span>` },
        {
          titulo: 'Registro',
          render: (x) => (x.tabla === 'usuarios' ? esc(x.antes?.email ?? '') : esc(x.despues?.nombres ?? x.antes?.nombres ?? x.despues?.nombre ?? x.registro_id?.slice(0, 8) ?? '')),
        },
        { titulo: 'Campos modificados', render: (x) => esc(x.operacion === 'UPDATE' ? x.campos_cambiados.filter((c) => c !== 'updated_at').join(', ') : '—') },
      ],
      registros,
      { clicable: true, vacio: 'Sin movimientos con esos filtros.' },
    );
  }

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    const r = fila && registros.find((x) => String(x.id) === fila.dataset.id);
    if (!r) return;
    const claves = r.operacion === 'UPDATE' ? r.campos_cambiados : Object.keys(r.despues ?? r.antes ?? {});
    modal({
      titulo: `${OPERACIONES[r.operacion]} en ${r.tabla}`,
      contenido: tabla(
        [
          { titulo: 'Campo', campo: 'campo' },
          { titulo: 'Antes', render: (f) => esc(valorTexto(f.antes)) },
          { titulo: 'Después', render: (f) => esc(valorTexto(f.despues)) },
        ],
        claves.map((k) => ({ campo: k, antes: r.antes?.[k], despues: r.despues?.[k] })),
        { vacio: 'Sin diferencias.' },
      ),
    });
  });

  let espera;
  form.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => cargar().catch(() => {}), 350);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  await cargar();
}
