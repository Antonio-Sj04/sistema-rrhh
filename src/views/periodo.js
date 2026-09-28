import { tieneRol } from '../auth.js';
import { calcularReciboMensual, calcularReciboPrestacion, diasEntre } from '../lib/nomina-gt.js';
import { navegar, recargarVista } from '../router.js';
import { empresa, ok } from '../api.js';
import {
  abrirFormulario, badge, confirmar, descargarCSV, esc, fecha, modal, moneda, mostrarError, nombreCompleto, persona, tabla, toast,
} from '../ui.js';

// Ausencias que reducen los días pagados por el patrono
const TIPOS_NO_PAGADOS = ['permiso_sin_goce', 'suspension_igss', 'falta'];

export async function render(el, { id }) {
  const puedeGestionar = tieneRol('admin', 'nomina');
  const [periodo, recibos] = await Promise.all([
    ok(empresa('periodos_nomina').select('*').eq('id', id).single()),
    ok(
      empresa('recibos_nomina')
        .select('*, empleado:empleados(codigo, nombres, apellidos, dpi, afiliacion_igss, banco, cuenta_bancaria, puesto:puestos(nombre))')
        .eq('periodo_id', id),
    ),
  ]);
  recibos.sort((a, b) => a.empleado.apellidos.localeCompare(b.empleado.apellidos));

  const editable = puedeGestionar && periodo.estado !== 'cerrada';
  const esMensual = periodo.tipo === 'mensual';
  const total = (campo) => recibos.reduce((s, r) => s + Number(r[campo]), 0);

  const columnas = [
    { titulo: 'Empleado', render: (r) => persona(r.empleado, r.empleado.codigo) },
    { titulo: esMensual ? 'Días' : 'Días lab.', campo: 'dias_laborados', clase: 'numero' },
    { titulo: esMensual ? 'Salario' : 'Monto', render: (r) => moneda(r.salario_devengado), clase: 'numero' },
    ...(esMensual
      ? [
          { titulo: 'H. extra', render: (r) => moneda(r.monto_horas_extra), clase: 'numero' },
          { titulo: 'Bonif. incentivo', render: (r) => moneda(r.bonificacion_incentivo), clase: 'numero' },
          { titulo: 'Otros ingresos', render: (r) => moneda(r.otros_ingresos), clase: 'numero' },
          { titulo: 'IGSS', render: (r) => moneda(r.igss_laboral), clase: 'numero' },
          { titulo: 'ISR', render: (r) => moneda(r.isr), clase: 'numero' },
          { titulo: 'Otros desc.', render: (r) => moneda(r.otros_descuentos), clase: 'numero' },
        ]
      : []),
    { titulo: 'Líquido', render: (r) => `<strong>${moneda(r.liquido)}</strong>`, clase: 'numero' },
    {
      titulo: '',
      clase: 'derecha',
      render: (r) => `<div class="acciones" style="justify-content:flex-end">
        ${editable && esMensual ? `<button type="button" class="pequeno" data-ajustar="${r.id}">Ajustar</button>` : ''}
        <button type="button" class="pequeno" data-recibo="${r.id}">Recibo</button></div>`,
    },
  ];
  const celdaTotal = (campo) => `<td class="numero">${moneda(total(campo))}</td>`;
  const pie = recibos.length
    ? `<tr><td>Totales (${recibos.length})</td><td></td>${celdaTotal('salario_devengado')}
        ${esMensual ? ['monto_horas_extra', 'bonificacion_incentivo', 'otros_ingresos', 'igss_laboral', 'isr', 'otros_descuentos'].map(celdaTotal).join('') : ''}
        ${celdaTotal('liquido')}<td></td></tr>`
    : '';

  el.innerHTML = `
    <a class="miga" href="/nomina">← Nómina</a>
    <div class="encabezado">
      <div><h1>${esc(periodo.nombre)} ${badge(periodo.estado)}</h1>
        <p>Del ${fecha(periodo.fecha_inicio)} al ${fecha(periodo.fecha_fin)} · Pago: ${fecha(periodo.fecha_pago)}</p></div>
      <div class="acciones">
        ${recibos.length ? '<button type="button" id="csv">Exportar planilla</button><button type="button" id="banco">Archivo para banco</button>' : ''}
        ${editable && !recibos.length ? '<button type="button" class="peligro" id="eliminar">Eliminar período</button>' : ''}
        ${editable ? `<button type="button" class="primario" id="calcular">${recibos.length ? 'Recalcular' : 'Calcular nómina'}</button>` : ''}
        ${editable && recibos.length ? '<button type="button" class="boton-exito" id="cerrar">Cerrar período</button>' : ''}
      </div>
    </div>
    ${esMensual && recibos.length ? `<div class="rejilla rejilla-kpi" style="margin-bottom:16px">
      <div class="tarjeta kpi"><div class="kpi-etiqueta">Total ingresos</div><div class="kpi-valor">${moneda(total('total_ingresos'))}</div></div>
      <div class="tarjeta kpi"><div class="kpi-etiqueta">Total descuentos</div><div class="kpi-valor">${moneda(total('total_descuentos'))}</div></div>
      <div class="tarjeta kpi"><div class="kpi-etiqueta">Líquido a pagar</div><div class="kpi-valor">${moneda(total('liquido'))}</div></div>
      <div class="tarjeta kpi"><div class="kpi-etiqueta">Cuotas patronales</div>
        <div class="kpi-valor">${moneda(total('igss_patronal') + total('irtra') + total('intecap'))}</div>
        <div class="kpi-nota">IGSS ${moneda(total('igss_patronal'))} · IRTRA ${moneda(total('irtra'))} · INTECAP ${moneda(total('intecap'))}</div></div>
    </div>` : ''}
    <div class="tarjeta" id="tabla">${tabla(columnas, recibos, {
      pie,
      vacio: editable ? 'Presiona "Calcular nómina" para generar los recibos de los empleados activos.' : 'Este período no tiene recibos.',
    })}</div>`;

  el.querySelector('#calcular')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const n = await calcular(periodo, recibos);
      toast(`Nómina calculada para ${n} empleados.`);
      recargarVista();
    } catch (error) {
      mostrarError(error);
      e.target.disabled = false;
    }
  });

  el.querySelector('#cerrar')?.addEventListener('click', async () => {
    if (!(await confirmar('Al cerrar el período ya no podrá modificarse y los empleados podrán ver sus recibos. ¿Continuar?', { textoAceptar: 'Cerrar período' }))) return;
    try {
      await ok(empresa('periodos_nomina').update({ estado: 'cerrada' }).eq('id', id));
      toast('Período cerrado.');
      recargarVista();
    } catch (error) {
      mostrarError(error);
    }
  });

  el.querySelector('#eliminar')?.addEventListener('click', async () => {
    if (!(await confirmar('¿Eliminar este período?', { textoAceptar: 'Eliminar', peligro: true }))) return;
    try {
      await ok(empresa('periodos_nomina').delete().eq('id', id));
      navegar('/nomina');
    } catch (error) {
      mostrarError(error);
    }
  });

  el.querySelector('#csv')?.addEventListener('click', () =>
    descargarCSV(`${periodo.nombre}.csv`, [
      { titulo: 'Código', valor: (r) => r.empleado.codigo },
      { titulo: 'Empleado', valor: (r) => nombreCompleto(r.empleado) },
      { titulo: 'DPI', valor: (r) => r.empleado.dpi },
      { titulo: 'Afiliación IGSS', valor: (r) => r.empleado.afiliacion_igss },
      { titulo: 'Días', campo: 'dias_laborados' },
      { titulo: 'Salario devengado', campo: 'salario_devengado' },
      { titulo: 'Horas extra', campo: 'horas_extra' },
      { titulo: 'Monto horas extra', campo: 'monto_horas_extra' },
      { titulo: 'Bonificación incentivo', campo: 'bonificacion_incentivo' },
      { titulo: 'Otros ingresos', campo: 'otros_ingresos' },
      { titulo: 'Total ingresos', campo: 'total_ingresos' },
      { titulo: 'IGSS laboral', campo: 'igss_laboral' },
      { titulo: 'ISR', campo: 'isr' },
      { titulo: 'Otros descuentos', campo: 'otros_descuentos' },
      { titulo: 'Total descuentos', campo: 'total_descuentos' },
      { titulo: 'Líquido', campo: 'liquido' },
      { titulo: 'IGSS patronal', campo: 'igss_patronal' },
      { titulo: 'IRTRA', campo: 'irtra' },
      { titulo: 'INTECAP', campo: 'intecap' },
    ], recibos),
  );

  el.querySelector('#banco')?.addEventListener('click', () =>
    descargarCSV(`banco_${periodo.nombre}.csv`, [
      { titulo: 'Banco', valor: (r) => r.empleado.banco },
      { titulo: 'Cuenta', valor: (r) => r.empleado.cuenta_bancaria },
      { titulo: 'Beneficiario', valor: (r) => nombreCompleto(r.empleado) },
      { titulo: 'Monto', campo: 'liquido' },
    ], recibos),
  );

  el.querySelector('#tabla').addEventListener('click', (e) => {
    const bRecibo = e.target.closest('[data-recibo]');
    const bAjustar = e.target.closest('[data-ajustar]');
    if (bRecibo) mostrarRecibo(periodo, recibos.find((r) => r.id === bRecibo.dataset.recibo));
    if (bAjustar) ajustar(recibos.find((r) => r.id === bAjustar.dataset.ajustar));
  });
}

async function calcular(periodo, anteriores) {
  const { fecha_inicio: inicio, fecha_fin: fin } = periodo;
  const [parametros, empleados, ausencias] = await Promise.all([
    ok(empresa('parametros_nomina').select('*').eq('id', 1).single()),
    ok(
      empresa('empleados')
        .select('id, salario_base, fecha_ingreso, fecha_baja, estado')
        .lte('fecha_ingreso', fin)
        .or(`estado.eq.activo,and(estado.eq.baja,fecha_baja.gte.${inicio})`),
    ),
    ok(
      empresa('ausencias')
        .select('empleado_id, dias, tipo')
        .eq('estado', 'aprobada')
        .in('tipo', TIPOS_NO_PAGADOS)
        .gte('fecha_inicio', inicio)
        .lte('fecha_inicio', fin),
    ),
  ]);
  if (!empleados.length) throw new Error('No hay empleados activos para este período.');

  // Conserva los ajustes manuales (horas extra, otros) al recalcular
  const ajustes = Object.fromEntries(anteriores.map((r) => [r.empleado_id, r]));
  const descontar = ausencias.reduce((m, a) => ((m[a.empleado_id] = (m[a.empleado_id] ?? 0) + Number(a.dias)), m), {});

  const filas = empleados.map((e) => {
    let recibo;
    if (periodo.tipo === 'mensual') {
      const desde = e.fecha_ingreso > inicio ? e.fecha_ingreso : inicio;
      const hasta = e.fecha_baja && e.fecha_baja < fin ? e.fecha_baja : fin;
      // Mes completo = 30 días; si entró o salió a medio mes se cuentan los días reales
      const completo = desde === inicio && hasta === fin;
      const dias = Math.max(0, (completo ? 30 : Math.min(30, diasEntre(desde, hasta))) - (descontar[e.id] ?? 0));
      const previo = ajustes[e.id];
      recibo = calcularReciboMensual(
        {
          salarioBase: e.salario_base,
          diasLaborados: dias,
          horasExtra: previo?.horas_extra ?? 0,
          otrosIngresos: previo?.otros_ingresos ?? 0,
          otrosDescuentos: previo?.otros_descuentos ?? 0,
        },
        parametros,
      );
    } else {
      recibo = calcularReciboPrestacion({ salarioBase: e.salario_base, fechaIngreso: e.fecha_ingreso, inicioPeriodo: inicio, finPeriodo: fin });
    }
    return { ...recibo, periodo_id: periodo.id, empleado_id: e.id };
  });

  await ok(empresa('recibos_nomina').delete().eq('periodo_id', periodo.id));
  await ok(empresa('recibos_nomina').insert(filas));
  await ok(empresa('periodos_nomina').update({ estado: 'calculada' }).eq('id', periodo.id));
  return filas.length;
}

function ajustar(recibo) {
  abrirFormulario({
    titulo: `Ajustar recibo — ${nombreCompleto(recibo.empleado)}`,
    campos: [
      { nombre: 'dias_laborados', etiqueta: 'Días laborados', tipo: 'number', paso: '0.5', min: 0, max: 30, requerido: true },
      { nombre: 'horas_extra', etiqueta: 'Horas extra (pagadas al 150%)', tipo: 'number', paso: '0.5', min: 0, requerido: true },
      { nombre: 'otros_ingresos', etiqueta: 'Otros ingresos: comisiones, bonos (Q)', tipo: 'number', paso: '0.01', min: 0, requerido: true },
      { nombre: 'otros_descuentos', etiqueta: 'Otros descuentos: anticipos, préstamos (Q)', tipo: 'number', paso: '0.01', min: 0, requerido: true },
    ],
    valores: recibo,
    alGuardar: async (datos) => {
      const parametros = await ok(empresa('parametros_nomina').select('*').eq('id', 1).single());
      const nuevo = calcularReciboMensual(
        {
          salarioBase: recibo.salario_base,
          diasLaborados: datos.dias_laborados,
          horasExtra: datos.horas_extra,
          otrosIngresos: datos.otros_ingresos,
          otrosDescuentos: datos.otros_descuentos,
        },
        parametros,
      );
      await ok(empresa('recibos_nomina').update(nuevo).eq('id', recibo.id));
      toast('Recibo actualizado.');
      recargarVista();
    },
  });
}

function mostrarRecibo(periodo, r) {
  const fila = (concepto, monto) =>
    Number(monto) ? `<tr><td>${esc(concepto)}</td><td class="numero">${moneda(monto)}</td></tr>` : '';
  const { el } = modal({
    titulo: 'Recibo de pago',
    contenido: `<div class="recibo">
      <div class="recibo-cabecera">
        <div><h2>${esc(periodo.nombre)}</h2><div class="texto-suave">Del ${fecha(periodo.fecha_inicio)} al ${fecha(periodo.fecha_fin)}</div></div>
        <div class="derecha"><strong>${esc(nombreCompleto(r.empleado))}</strong>
          <div class="texto-suave">${esc(r.empleado.codigo)} · ${esc(r.empleado.puesto?.nombre ?? '')}</div>
          <div class="texto-suave">DPI ${esc(r.empleado.dpi ?? '—')} · IGSS ${esc(r.empleado.afiliacion_igss ?? '—')}</div></div>
      </div>
      <div class="rejilla rejilla-2">
        <table><thead><tr><th>Ingresos</th><th class="numero">Monto</th></tr></thead><tbody>
          ${fila(`Salario (${r.dias_laborados} días)`, r.salario_devengado)}
          ${fila(`Horas extra (${r.horas_extra} h)`, r.monto_horas_extra)}
          ${fila('Bonificación incentivo', r.bonificacion_incentivo)}
          ${fila('Otros ingresos', r.otros_ingresos)}
        </tbody><tfoot><tr><td>Total ingresos</td><td class="numero">${moneda(r.total_ingresos)}</td></tr></tfoot></table>
        <table><thead><tr><th>Descuentos</th><th class="numero">Monto</th></tr></thead><tbody>
          ${fila('IGSS laboral', r.igss_laboral)}
          ${fila('ISR', r.isr)}
          ${fila('Otros descuentos', r.otros_descuentos)}
        </tbody><tfoot><tr><td>Total descuentos</td><td class="numero">${moneda(r.total_descuentos)}</td></tr></tfoot></table>
      </div>
      <div class="recibo-total">Líquido a recibir: ${moneda(r.liquido)}</div>
      <p style="margin-top:48px" class="texto-suave">f. ______________________________<br/>Recibí conforme</p>
    </div>`,
    pie: '<button type="button" data-cerrar>Cerrar</button><button type="button" class="primario" id="imprimir">Imprimir</button>',
  });
  el.querySelector('#imprimir').addEventListener('click', () => {
    document.body.classList.add('imprimiendo-modal');
    window.print();
    document.body.classList.remove('imprimiendo-modal');
  });
}

export { mostrarRecibo };
