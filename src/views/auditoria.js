import { empresa, ok, supabase } from '../supabase.js';
import { esc, etiqueta, fecha, modal, porId, tabla } from '../ui.js';

const OPERACIONES = { INSERT: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación' };

export async function render(el) {
  el.innerHTML = `
    <div class="encabezado"><div><h1>Bitácora de auditoría</h1>
      <p>Registro de cambios en expedientes, contratos, nómina, postulantes y usuarios.</p></div></div>
    <div class="tarjeta">
      <div class="filtros">
        <select id="f-tabla"><option value="">Todas las tablas</option>
          ${['empleados', 'contratos', 'periodos_nomina', 'parametros_nomina', 'liquidaciones', 'postulantes', 'antecedentes', 'perfiles', 'usuarios']
            .map((t) => `<option value="${t}">${esc(etiqueta(t))}</option>`).join('')}</select>
        <select id="f-op"><option value="">Todas las operaciones</option>
          ${Object.entries(OPERACIONES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
      </div>
      <div id="lista"></div>
    </div>`;

  const perfiles = porId(await ok(supabase.from('perfiles').select('id, nombre, email')));
  const lista = el.querySelector('#lista');
  let registros = [];

  async function cargar() {
    let q = empresa('auditoria').select('*').order('fecha', { ascending: false }).limit(200);
    const t = el.querySelector('#f-tabla').value;
    const o = el.querySelector('#f-op').value;
    if (t) q = q.eq('tabla', t);
    if (o) q = q.eq('operacion', o);
    registros = await ok(q);
    lista.innerHTML = tabla(
      [
        { titulo: 'Fecha', render: (r) => fecha(r.fecha, true) },
        { titulo: 'Usuario', render: (r) => esc(perfiles[r.usuario_id]?.nombre ?? perfiles[r.usuario_id]?.email ?? 'Sistema') },
        { titulo: 'Operación', render: (r) => esc(OPERACIONES[r.operacion]) },
        { titulo: 'Tabla', render: (r) => esc(`${r.esquema}.${r.tabla}`) },
        {
          titulo: 'Registro',
          render: (r) => (r.tabla === 'usuarios' ? esc(r.antes?.email ?? '') : `<code>${esc(r.registro_id?.slice(0, 8))}</code>`),
        },
      ],
      registros,
      { clicable: true, vacio: 'Sin movimientos registrados.' },
    );
  }

  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    const r = fila && registros.find((x) => String(x.id) === fila.dataset.id);
    if (!r) return;
    // Muestra solo los campos que cambiaron
    const claves = [...new Set([...Object.keys(r.antes ?? {}), ...Object.keys(r.despues ?? {})])].filter(
      (k) => JSON.stringify(r.antes?.[k]) !== JSON.stringify(r.despues?.[k]),
    );
    modal({
      titulo: `${OPERACIONES[r.operacion]} en ${r.tabla}`,
      contenido: tabla(
        [
          { titulo: 'Campo', campo: 'campo' },
          { titulo: 'Antes', render: (f) => esc(f.antes ?? '—') },
          { titulo: 'Después', render: (f) => esc(f.despues ?? '—') },
        ],
        claves.map((k) => ({ campo: k, antes: r.antes?.[k], despues: r.despues?.[k] })),
        { vacio: 'Sin diferencias.' },
      ),
    });
  });

  el.querySelector('#f-tabla').addEventListener('change', cargar);
  el.querySelector('#f-op').addEventListener('change', cargar);
  await cargar();
}
