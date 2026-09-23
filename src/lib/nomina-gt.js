// Cálculos de nómina según la legislación laboral de Guatemala.
// Los porcentajes y montos vienen de empresa.parametros_nomina para que
// puedan actualizarse sin tocar código.

export const PARAMETROS_DEFECTO = {
  igss_laboral: 0.0483,
  igss_patronal: 0.1067,
  irtra: 0.01,
  intecap: 0.01,
  bonificacion_incentivo: 250, // Decreto 37-2001
  isr_deduccion_fija: 48000, // Ley de Actualización Tributaria, art. 72
  isr_tramo: 300000,
  isr_tasa1: 0.05,
  isr_tasa2: 0.07,
  // Parte del aguinaldo y del Bono 14 que se suma al salario para indemnizar
  // (Decreto 76-78 art. 9 y Decreto 42-92 art. 4: una sexta parte de cada uno)
  indemnizacion_fraccion_prestaciones: 1 / 6,
};

const DIAS_MES = 30;
const HORAS_JORNADA_DIURNA = 8;
const RECARGO_HORA_EXTRA = 1.5; // Código de Trabajo, art. 121

export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function normalizar(p) {
  const r = { ...PARAMETROS_DEFECTO };
  for (const k of Object.keys(r)) if (p?.[k] != null) r[k] = Number(p[k]);
  return r;
}

/** ISR anual para asalariados (régimen de 5% / 7%). */
export function isrAnual(rentaImponible, parametros) {
  const p = normalizar(parametros);
  if (rentaImponible <= 0) return 0;
  if (rentaImponible <= p.isr_tramo) return redondear(rentaImponible * p.isr_tasa1);
  return redondear(p.isr_tramo * p.isr_tasa1 + (rentaImponible - p.isr_tramo) * p.isr_tasa2);
}

/**
 * Retención mensual de ISR proyectando el salario del mes a 12 meses.
 * Aguinaldo y Bono 14 están exentos (hasta el 100% del salario), por eso
 * no se incluyen en la proyección.
 */
export function retencionIsrMensual(salarioBase, parametros) {
  const p = normalizar(parametros);
  const ingresosAnuales = (salarioBase + p.bonificacion_incentivo) * 12;
  const igssAnual = salarioBase * p.igss_laboral * 12;
  const renta = ingresosAnuales - p.isr_deduccion_fija - igssAnual;
  return redondear(isrAnual(renta, p) / 12);
}

/** Recibo de nómina mensual de un empleado. */
export function calcularReciboMensual(
  { salarioBase, diasLaborados = DIAS_MES, horasExtra = 0, otrosIngresos = 0, otrosDescuentos = 0 },
  parametros,
) {
  const p = normalizar(parametros);
  const base = Number(salarioBase) || 0;
  const factor = Math.min(Math.max(Number(diasLaborados) || 0, 0), DIAS_MES) / DIAS_MES;

  const salarioDevengado = redondear(base * factor);
  const valorHora = base / DIAS_MES / HORAS_JORNADA_DIURNA;
  const montoHorasExtra = redondear((Number(horasExtra) || 0) * valorHora * RECARGO_HORA_EXTRA);
  const bonificacion = redondear(p.bonificacion_incentivo * factor);
  const otros = redondear(otrosIngresos);

  // La bonificación incentivo no es base para IGSS
  const baseIgss = salarioDevengado + montoHorasExtra + otros;
  const igssLaboral = redondear(baseIgss * p.igss_laboral);
  const isr = factor > 0 ? retencionIsrMensual(base, p) : 0;

  const totalIngresos = redondear(salarioDevengado + montoHorasExtra + bonificacion + otros);
  const totalDescuentos = redondear(igssLaboral + isr + (Number(otrosDescuentos) || 0));

  return {
    salario_base: base,
    dias_laborados: Number(diasLaborados) || 0,
    salario_devengado: salarioDevengado,
    horas_extra: Number(horasExtra) || 0,
    monto_horas_extra: montoHorasExtra,
    bonificacion_incentivo: bonificacion,
    otros_ingresos: otros,
    total_ingresos: totalIngresos,
    igss_laboral: igssLaboral,
    isr,
    otros_descuentos: redondear(otrosDescuentos),
    total_descuentos: totalDescuentos,
    liquido: redondear(totalIngresos - totalDescuentos),
    igss_patronal: redondear(baseIgss * p.igss_patronal),
    irtra: redondear(baseIgss * p.irtra),
    intecap: redondear(baseIgss * p.intecap),
  };
}

const MS_DIA = 86400000;
const aFecha = (f) => (f instanceof Date ? f : new Date(`${f}T00:00:00Z`));

/** Días entre dos fechas, ambas incluidas. */
export function diasEntre(inicio, fin) {
  return Math.floor((aFecha(fin) - aFecha(inicio)) / MS_DIA) + 1;
}

/**
 * Prestación proporcional (aguinaldo o Bono 14): un salario completo por
 * año laborado dentro del período, proporcional si ingresó después.
 */
export function prestacionProporcional({ salarioBase, fechaIngreso, inicioPeriodo, finPeriodo }) {
  const inicio = aFecha(fechaIngreso) > aFecha(inicioPeriodo) ? fechaIngreso : inicioPeriodo;
  const dias = Math.max(0, diasEntre(inicio, finPeriodo));
  const diasPeriodo = diasEntre(inicioPeriodo, finPeriodo);
  return {
    dias,
    monto: redondear((Number(salarioBase) * Math.min(dias, diasPeriodo)) / diasPeriodo),
  };
}

/** Rango legal de cada prestación para un año de pago. */
export function periodoPrestacion(tipo, anio) {
  if (tipo === 'aguinaldo') return { inicio: `${anio - 1}-12-01`, fin: `${anio}-11-30`, pago: `${anio}-12-15` };
  if (tipo === 'bono14') return { inicio: `${anio - 1}-07-01`, fin: `${anio}-06-30`, pago: `${anio}-07-15` };
  throw new Error(`Tipo de prestación desconocido: ${tipo}`);
}

// ---------------------------------------------------------------------
// Liquidación laboral
// ---------------------------------------------------------------------
export const MOTIVOS_BAJA = [
  ['renuncia', 'Renuncia'],
  ['despido_injustificado', 'Despido injustificado'],
  ['despido_indirecto', 'Despido indirecto'],
  ['despido_justificado', 'Despido justificado'],
  ['fin_contrato', 'Fin de contrato a plazo fijo'],
  ['mutuo_acuerdo', 'Mutuo acuerdo'],
  ['otro', 'Otro'],
];

// Código de Trabajo, arts. 78, 79 y 82
export const MOTIVOS_CON_INDEMNIZACION = ['despido_injustificado', 'despido_indirecto'];

const DIAS_VACACIONES_ANUALES = 15; // Código de Trabajo, art. 130
const DIAS_ANIO = 365;

const iso = (d) => aFecha(d).toISOString().slice(0, 10);
const mayor = (a, b) => (aFecha(a) > aFecha(b) ? a : b);

/** Último aniversario de ingreso anterior o igual a la fecha de baja. */
export function ultimoAniversario(fechaIngreso, fechaBaja) {
  const ingreso = aFecha(fechaIngreso);
  const baja = aFecha(fechaBaja);
  const aniversario = new Date(Date.UTC(baja.getUTCFullYear(), ingreso.getUTCMonth(), ingreso.getUTCDate()));
  if (aniversario > baja) aniversario.setUTCFullYear(aniversario.getUTCFullYear() - 1);
  return iso(aniversario < ingreso ? ingreso : aniversario);
}

/** Días de vacaciones generados desde el último aniversario, menos los ya gozados. */
export function vacacionesPendientes({ fechaIngreso, fechaBaja, diasUsados = 0 }) {
  const desde = ultimoAniversario(fechaIngreso, fechaBaja);
  const generados = (DIAS_VACACIONES_ANUALES * diasEntre(desde, fechaBaja)) / DIAS_ANIO;
  return Math.max(0, redondear(generados - diasUsados));
}

/** Aguinaldo o Bono 14 proporcional desde el inicio de su período hasta la baja. */
function prestacionHastaBaja(salario, fechaIngreso, inicioPeriodo, fechaBaja) {
  const dias = Math.max(0, diasEntre(mayor(fechaIngreso, inicioPeriodo), fechaBaja));
  return { dias, monto: redondear((salario * dias) / DIAS_ANIO) };
}

/**
 * Liquidación al terminar la relación laboral.
 * Devuelve ingresos y descuentos detallados, y el total a pagar.
 */
export function calcularLiquidacion(
  {
    salarioBase,
    fechaIngreso,
    fechaBaja,
    motivo,
    diasVacacionesPendientes,
    diasVacacionesUsados = 0,
    diasSalarioPendiente = 0,
    otrosIngresos = 0,
    otrosDescuentos = 0,
  },
  parametros,
) {
  const p = normalizar(parametros);
  const s = Number(salarioBase) || 0;
  const diaSalario = s / DIAS_MES;
  const diasLaborados = diasEntre(fechaIngreso, fechaBaja);
  const anios = diasLaborados / DIAS_ANIO;
  const baja = aFecha(fechaBaja);
  const y = baja.getUTCFullYear();
  const m = baja.getUTCMonth() + 1;
  const ingresos = [];
  const descuentos = [];

  if (MOTIVOS_CON_INDEMNIZACION.includes(motivo)) {
    const base = s * (1 + 2 * p.indemnizacion_fraccion_prestaciones);
    ingresos.push({
      concepto: 'Indemnización',
      detalle: `${redondear(anios)} años × ${redondear(base)} (salario + 1/6 de aguinaldo y Bono 14)`,
      monto: redondear(base * anios),
    });
  }

  const aguinaldo = prestacionHastaBaja(s, fechaIngreso, m === 12 ? `${y}-12-01` : `${y - 1}-12-01`, fechaBaja);
  ingresos.push({ concepto: 'Aguinaldo proporcional', detalle: `${aguinaldo.dias} días`, monto: aguinaldo.monto });

  const bono14 = prestacionHastaBaja(s, fechaIngreso, m >= 7 ? `${y}-07-01` : `${y - 1}-07-01`, fechaBaja);
  ingresos.push({ concepto: 'Bono 14 proporcional', detalle: `${bono14.dias} días`, monto: bono14.monto });

  const diasVac =
    diasVacacionesPendientes != null
      ? Number(diasVacacionesPendientes)
      : vacacionesPendientes({ fechaIngreso, fechaBaja, diasUsados: diasVacacionesUsados });
  if (diasVac > 0) {
    ingresos.push({ concepto: 'Vacaciones no gozadas', detalle: `${diasVac} días`, monto: redondear(diaSalario * diasVac) });
  }

  const diasPend = Math.min(Math.max(Number(diasSalarioPendiente) || 0, 0), DIAS_MES);
  if (diasPend > 0) {
    const salarioPend = redondear(diaSalario * diasPend);
    ingresos.push({ concepto: 'Salario pendiente', detalle: `${diasPend} días`, monto: salarioPend });
    ingresos.push({
      concepto: 'Bonificación incentivo pendiente',
      detalle: `${diasPend} días`,
      monto: redondear((p.bonificacion_incentivo / DIAS_MES) * diasPend),
    });
    descuentos.push({ concepto: 'IGSS laboral', detalle: 'Sobre salario pendiente', monto: redondear(salarioPend * p.igss_laboral) });
  }

  if (Number(otrosIngresos) > 0) ingresos.push({ concepto: 'Otros ingresos', detalle: '', monto: redondear(otrosIngresos) });
  if (Number(otrosDescuentos) > 0) descuentos.push({ concepto: 'Otros descuentos', detalle: 'Anticipos, préstamos, etc.', monto: redondear(otrosDescuentos) });

  const totalIngresos = redondear(ingresos.reduce((t, l) => t + l.monto, 0));
  const totalDescuentos = redondear(descuentos.reduce((t, l) => t + l.monto, 0));
  return {
    dias_laborados: diasLaborados,
    anios: redondear(anios),
    dias_vacaciones: diasVac,
    ingresos,
    descuentos,
    total_ingresos: totalIngresos,
    total_descuentos: totalDescuentos,
    total: redondear(totalIngresos - totalDescuentos),
  };
}

/** Recibo para aguinaldo / Bono 14 (exentos de IGSS e ISR). */
export function calcularReciboPrestacion({ salarioBase, fechaIngreso, inicioPeriodo, finPeriodo }) {
  const { dias, monto } = prestacionProporcional({ salarioBase, fechaIngreso, inicioPeriodo, finPeriodo });
  return {
    salario_base: Number(salarioBase),
    dias_laborados: dias,
    salario_devengado: monto,
    horas_extra: 0,
    monto_horas_extra: 0,
    bonificacion_incentivo: 0,
    otros_ingresos: 0,
    total_ingresos: monto,
    igss_laboral: 0,
    isr: 0,
    otros_descuentos: 0,
    total_descuentos: 0,
    liquido: monto,
    igss_patronal: 0,
    irtra: 0,
    intecap: 0,
  };
}
