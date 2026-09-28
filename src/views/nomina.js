import { tieneRol } from '../auth.js';
import { periodoPrestacion } from '../lib/nomina-gt.js';
import { navegar } from '../router.js';
import { empresa, ok } from '../api.js';
import { abrirFormulario, badge, esc, fecha, moneda, mostrarError, tabla, toast } from '../ui.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TIPOS = { mensual: 'Mensual', aguinaldo: 'Aguinaldo', bono14: 'Bono 14' };

export async function render(el) {
  const puedeGestionar = tieneRol('admin', 'nomina');
  const [periodos, parametros] = await Promise.all([
    ok(empresa('periodos_nomina').select('*, recibos_nomina(liquido, total_ingresos)').order('fecha_fin', { ascending: false })),
    ok(empresa('parametros_nomina').select('*').eq('id', 1).single()),
  ]);

  const suma = (p, campo) => p.recibos_nomina.reduce((s, r) => s + Number(r[campo]), 0);
  const pct = (n) => `${(Number(n) * 100).toFixed(2)}%`;

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Nómina</h1><p>Planillas mensuales, Aguinaldo (Decreto 76-78) y Bono 14 (Decreto 42-92).</p></div>
      <div class="acciones">
        ${puedeGestionar ? '<button type="button" id="parametros">Parámetros</button><button type="button" class="primario" id="nuevo">+ Nuevo período</button>' : ''}
      </div>
    </div>
    <div class="tarjeta" style="margin-bottom:16px">
      <div id="lista">${tabla(
        [
          { titulo: 'Período', render: (p) => `<strong>${esc(p.nombre)}</strong>` },
          { titulo: 'Tipo', render: (p) => esc(TIPOS[p.tipo]) },
          { titulo: 'Del', render: (p) => fecha(p.fecha_inicio) },
          { titulo: 'Al', render: (p) => fecha(p.fecha_fin) },
          { titulo: 'Pago', render: (p) => fecha(p.fecha_pago) },
          { titulo: 'Empleados', render: (p) => p.recibos_nomina.length, clase: 'numero' },
          { titulo: 'Total líquido', render: (p) => moneda(suma(p, 'liquido')), clase: 'numero' },
          { titulo: 'Estado', render: (p) => badge(p.estado) },
        ],
        periodos,
        { clicable: true, vacio: 'Crea el primer período de nómina.' },
      )}</div>
    </div>
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Parámetros vigentes</h2></div>
      <div class="tarjeta-cuerpo"><dl class="datos">
        <div><dt>IGSS laboral</dt><dd>${pct(parametros.igss_laboral)}</dd></div>
        <div><dt>IGSS patronal</dt><dd>${pct(parametros.igss_patronal)}</dd></div>
        <div><dt>IRTRA / INTECAP</dt><dd>${pct(parametros.irtra)} / ${pct(parametros.intecap)}</dd></div>
        <div><dt>Bonificación incentivo</dt><dd>${moneda(parametros.bonificacion_incentivo)}</dd></div>
        <div><dt>ISR: deducción fija anual</dt><dd>${moneda(parametros.isr_deduccion_fija)}</dd></div>
        <div><dt>ISR: tasas</dt><dd>${pct(parametros.isr_tasa1)} hasta ${moneda(parametros.isr_tramo)}, luego ${pct(parametros.isr_tasa2)}</dd></div>
        <div><dt>Indemnización: fracción de aguinaldo y Bono 14</dt><dd>${pct(parametros.indemnizacion_fraccion_prestaciones)}</dd></div>
        <div><dt>Salario mínimo de referencia</dt><dd>${parametros.salario_minimo ? moneda(parametros.salario_minimo) : '—'}</dd></div>
      </dl></div>
    </div>`;

  el.querySelector('#lista').addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    if (fila) navegar(`/nomina/${fila.dataset.id}`);
  });

  const anio = new Date().getFullYear();
  el.querySelector('#nuevo')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Nuevo período de nómina',
      textoGuardar: 'Crear período',
      campos: [
        { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: Object.entries(TIPOS) },
        { nombre: 'anio', etiqueta: 'Año', tipo: 'number', requerido: true, min: 2000, max: 2100 },
        { nombre: 'mes', etiqueta: 'Mes (solo nómina mensual)', tipo: 'select', opciones: MESES.map((m, i) => [i + 1, m]) },
        { nombre: 'fecha_pago', etiqueta: 'Fecha de pago', tipo: 'date' },
      ],
      valores: { tipo: 'mensual', anio, mes: new Date().getMonth() + 1 },
      alGuardar: async ({ tipo, anio: a, mes, fecha_pago }) => {
        let datos;
        if (tipo === 'mensual') {
          if (!mes) throw new Error('Selecciona el mes.');
          const m = String(mes).padStart(2, '0');
          const ultimo = new Date(a, Number(mes), 0).getDate();
          datos = { nombre: `Nómina ${MESES[mes - 1]} ${a}`, fecha_inicio: `${a}-${m}-01`, fecha_fin: `${a}-${m}-${ultimo}`, fecha_pago: fecha_pago ?? `${a}-${m}-${ultimo}` };
        } else {
          const r = periodoPrestacion(tipo, a);
          datos = { nombre: `${TIPOS[tipo]} ${a}`, fecha_inicio: r.inicio, fecha_fin: r.fin, fecha_pago: fecha_pago ?? r.pago };
        }
        const [nuevo] = await ok(empresa('periodos_nomina').insert({ ...datos, tipo }).select('id'));
        toast('Período creado.');
        navegar(`/nomina/${nuevo.id}`);
      },
    }),
  );

  el.querySelector('#parametros')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Parámetros de nómina',
      campos: [
        { nombre: 'igss_laboral', etiqueta: 'IGSS laboral (decimal)', tipo: 'number', paso: '0.0001', requerido: true, ayuda: '0.0483 = 4.83%' },
        { nombre: 'igss_patronal', etiqueta: 'IGSS patronal (decimal)', tipo: 'number', paso: '0.0001', requerido: true },
        { nombre: 'irtra', etiqueta: 'IRTRA (decimal)', tipo: 'number', paso: '0.0001', requerido: true },
        { nombre: 'intecap', etiqueta: 'INTECAP (decimal)', tipo: 'number', paso: '0.0001', requerido: true },
        { nombre: 'bonificacion_incentivo', etiqueta: 'Bonificación incentivo (Q)', tipo: 'number', paso: '0.01', requerido: true },
        { nombre: 'salario_minimo', etiqueta: 'Salario mínimo de referencia (Q)', tipo: 'number', paso: '0.01' },
        { nombre: 'isr_deduccion_fija', etiqueta: 'ISR: deducción fija anual (Q)', tipo: 'number', paso: '0.01', requerido: true },
        { nombre: 'isr_tramo', etiqueta: 'ISR: límite del primer tramo (Q)', tipo: 'number', paso: '0.01', requerido: true },
        { nombre: 'isr_tasa1', etiqueta: 'ISR: tasa primer tramo', tipo: 'number', paso: '0.0001', requerido: true },
        { nombre: 'isr_tasa2', etiqueta: 'ISR: tasa excedente', tipo: 'number', paso: '0.0001', requerido: true },
        { nombre: 'indemnizacion_fraccion_prestaciones', etiqueta: 'Indemnización: fracción de aguinaldo y Bono 14', tipo: 'number', paso: '0.000001', min: 0, max: 1, requerido: true, ayuda: '0.166667 = una sexta parte de cada prestación' },
      ],
      valores: parametros,
      alGuardar: async (datos) => {
        await ok(empresa('parametros_nomina').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', 1));
        toast('Parámetros actualizados.');
        render(el).catch(mostrarError);
      },
    }),
  );
}
