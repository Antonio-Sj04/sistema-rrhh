// Baja de empleados con cálculo de liquidación (Guatemala).
import { MOTIVOS_BAJA, MOTIVOS_CON_INDEMNIZACION, calcularLiquidacion, ultimoAniversario, vacacionesPendientes } from './lib/nomina-gt.js';
import { empresa, ok } from './supabase.js';
import { abrirFormulario, esc, fecha, hoy, leerFormulario, modal, moneda, nombreCompleto } from './ui.js';

const textoMotivo = (m) => MOTIVOS_BAJA.find(([v]) => v === m)?.[1] ?? m;

function tablaConceptos(titulo, lineas, total) {
  const filas = lineas
    .map((l) => `<tr><td>${esc(l.concepto)}${l.detalle ? `<div class="texto-suave">${esc(l.detalle)}</div>` : ''}</td>
      <td class="numero">${moneda(l.monto)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>${esc(titulo)}</th><th class="numero">Monto</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="2" class="texto-suave">Ninguno</td></tr>'}</tbody>
    <tfoot><tr><td>Total</td><td class="numero">${moneda(total)}</td></tr></tfoot></table>`;
}

/** Detalle imprimible de una liquidación. */
export function liquidacionHTML(emp, liq) {
  return `<div class="recibo">
    <div class="recibo-cabecera">
      <div><h2>Liquidación laboral</h2>
        <div class="texto-suave">${esc(textoMotivo(liq.motivo))} · Baja: ${fecha(liq.fecha_baja)}</div></div>
      <div class="derecha"><strong>${esc(nombreCompleto(emp))}</strong>
        <div class="texto-suave">${esc(emp.codigo ?? '')} · DPI ${esc(emp.dpi ?? '—')}</div>
        <div class="texto-suave">Ingreso: ${fecha(emp.fecha_ingreso)} · ${liq.dias_laborados} días laborados</div>
        <div class="texto-suave">Salario base: ${moneda(liq.salario_base)}</div></div>
    </div>
    <div class="rejilla rejilla-2">
      ${tablaConceptos('Ingresos', liq.ingresos, liq.total_ingresos)}
      ${tablaConceptos('Descuentos', liq.descuentos, liq.total_descuentos)}
    </div>
    <div class="recibo-total">Total a pagar: ${moneda(liq.total)}</div>
    ${liq.observaciones ? `<p><strong>Observaciones:</strong> ${esc(liq.observaciones)}</p>` : ''}
    <p class="texto-suave" style="margin-top:12px;font-size:12px">Cálculo según el Código de Trabajo de Guatemala
      (arts. 82 y 130), Decreto 76-78 (aguinaldo) y Decreto 42-92 (Bono 14).</p>
    <div class="rejilla rejilla-2" style="margin-top:56px">
      <p class="texto-suave">f. ______________________________<br/>Empleador</p>
      <p class="texto-suave">f. ______________________________<br/>Recibí conforme: ${esc(nombreCompleto(emp))}</p>
    </div>
  </div>`;
}

export function imprimirContenido(titulo, html) {
  const { el } = modal({
    titulo,
    contenido: html,
    pie: '<button type="button" data-cerrar>Cerrar</button><button type="button" class="primario" data-imprimir>Imprimir</button>',
  });
  el.querySelector('[data-imprimir]').addEventListener('click', () => {
    document.body.classList.add('imprimiendo-modal');
    window.print();
    document.body.classList.remove('imprimiendo-modal');
  });
}

/** Formulario de baja con vista previa de la liquidación. */
export async function abrirBaja(emp, alTerminar) {
  const [parametros, vacaciones] = await Promise.all([
    ok(empresa('parametros_nomina').select('*').eq('id', 1).single()),
    ok(empresa('ausencias').select('fecha_inicio, dias').eq('empleado_id', emp.id).eq('tipo', 'vacaciones').eq('estado', 'aprobada')),
  ]);

  const diasUsados = (fechaBaja) => {
    const desde = ultimoAniversario(emp.fecha_ingreso, fechaBaja);
    return vacaciones.filter((v) => v.fecha_inicio >= desde && v.fecha_inicio <= fechaBaja).reduce((s, v) => s + Number(v.dias), 0);
  };
  const vacacionesSugeridas = (fechaBaja) =>
    vacacionesPendientes({ fechaIngreso: emp.fecha_ingreso, fechaBaja, diasUsados: diasUsados(fechaBaja) });

  const baja = hoy();
  const campos = [
    { nombre: 'fecha_baja', etiqueta: 'Fecha de baja', tipo: 'date', requerido: true },
    { nombre: 'motivo', etiqueta: 'Motivo de terminación', tipo: 'select', requerido: true, opciones: MOTIVOS_BAJA },
    { nombre: 'dias_salario_pendiente', etiqueta: 'Días de salario pendientes de pago', tipo: 'number', paso: '0.5', min: 0, max: 30, requerido: true, ayuda: 'Días del último mes que aún no se pagaron en planilla' },
    { nombre: 'dias_vacaciones', etiqueta: 'Días de vacaciones pendientes', tipo: 'number', paso: '0.01', min: 0, requerido: true, ayuda: 'Calculado desde el último aniversario; puedes ajustarlo' },
    { nombre: 'otros_ingresos', etiqueta: 'Otros ingresos (Q)', tipo: 'number', paso: '0.01', min: 0 },
    { nombre: 'otros_descuentos', etiqueta: 'Otros descuentos (Q)', tipo: 'number', paso: '0.01', min: 0, ayuda: 'Anticipos, préstamos, etc.' },
    { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea' },
  ];

  const calcular = (d) =>
    calcularLiquidacion(
      {
        salarioBase: emp.salario_base,
        fechaIngreso: emp.fecha_ingreso,
        fechaBaja: d.fecha_baja,
        motivo: d.motivo,
        diasVacacionesPendientes: d.dias_vacaciones ?? 0,
        diasSalarioPendiente: d.dias_salario_pendiente ?? 0,
        otrosIngresos: d.otros_ingresos ?? 0,
        otrosDescuentos: d.otros_descuentos ?? 0,
      },
      parametros,
    );

  const { el } = abrirFormulario({
    titulo: `Dar de baja a ${nombreCompleto(emp)}`,
    textoGuardar: 'Confirmar baja y guardar liquidación',
    campos,
    valores: {
      fecha_baja: baja,
      motivo: 'renuncia',
      dias_salario_pendiente: Number(baja.slice(8, 10)),
      dias_vacaciones: vacacionesSugeridas(baja),
      otros_ingresos: 0,
      otros_descuentos: 0,
    },
    extra: '<div id="vista-previa" style="margin-top:20px"></div>',
    alGuardar: async (d) => {
      if (d.fecha_baja < emp.fecha_ingreso) throw new Error('La fecha de baja no puede ser anterior a la de ingreso.');
      const r = calcular(d);
      await ok(
        empresa('liquidaciones').upsert(
          {
            empleado_id: emp.id,
            fecha_baja: d.fecha_baja,
            motivo: d.motivo,
            salario_base: emp.salario_base,
            dias_laborados: r.dias_laborados,
            dias_vacaciones: r.dias_vacaciones,
            ingresos: r.ingresos,
            descuentos: r.descuentos,
            total_ingresos: r.total_ingresos,
            total_descuentos: r.total_descuentos,
            total: r.total,
            observaciones: d.observaciones,
          },
          { onConflict: 'empleado_id' },
        ),
      );
      await ok(
        empresa('empleados')
          .update({ estado: 'baja', fecha_baja: d.fecha_baja, motivo_baja: [textoMotivo(d.motivo), d.observaciones].filter(Boolean).join(': ') })
          .eq('id', emp.id),
      );
      alTerminar();
    },
  });

  el.querySelector('.modal').style.maxWidth = '860px';
  const form = el.querySelector('form');
  const vista = el.querySelector('#vista-previa');

  function actualizar(e) {
    if (e?.target.name === 'fecha_baja' && form.fecha_baja.value) {
      form.dias_vacaciones.value = vacacionesSugeridas(form.fecha_baja.value);
      form.dias_salario_pendiente.value = Number(form.fecha_baja.value.slice(8, 10));
    }
    const d = leerFormulario(form, campos);
    if (!d.fecha_baja || d.fecha_baja < emp.fecha_ingreso) {
      vista.innerHTML = '';
      return;
    }
    const r = calcular(d);
    vista.innerHTML = `<h3 style="margin-bottom:10px">Vista previa · ${r.dias_laborados} días laborados (${r.anios} años)</h3>
      ${MOTIVOS_CON_INDEMNIZACION.includes(d.motivo) ? '' : '<p class="texto-suave">Este motivo no genera indemnización.</p>'}
      <div class="rejilla rejilla-2">${tablaConceptos('Ingresos', r.ingresos, r.total_ingresos)}${tablaConceptos('Descuentos', r.descuentos, r.total_descuentos)}</div>
      <div class="recibo-total">Total a pagar: ${moneda(r.total)}</div>`;
  }
  form.addEventListener('input', actualizar);
  form.addEventListener('change', actualizar);
  actualizar();
}
