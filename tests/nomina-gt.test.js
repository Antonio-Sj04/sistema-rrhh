import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularLiquidacion,
  calcularReciboMensual,
  ultimoAniversario,
  vacacionesPendientes,
  calcularReciboPrestacion,
  isrAnual,
  periodoPrestacion,
  retencionIsrMensual,
} from '../src/lib/nomina-gt.js';

test('ISR anual: tramo del 5% y del 7%', () => {
  assert.equal(isrAnual(0), 0);
  assert.equal(isrAnual(-100), 0);
  assert.equal(isrAnual(100000), 5000);
  assert.equal(isrAnual(400000), 15000 + 7000);
});

test('salario bajo no paga ISR', () => {
  // (3500 + 250) * 12 = 45,000 < 48,000 de deducción fija
  assert.equal(retencionIsrMensual(3500), 0);
});

test('recibo mensual de Q10,000', () => {
  const r = calcularReciboMensual({ salarioBase: 10000 });
  assert.equal(r.salario_devengado, 10000);
  assert.equal(r.bonificacion_incentivo, 250);
  assert.equal(r.igss_laboral, 483);
  // renta = 123,000 - 48,000 - 5,796 = 69,204 → ISR anual 3,460.20 → 288.35 mensual
  assert.equal(r.isr, 288.35);
  assert.equal(r.total_ingresos, 10250);
  assert.equal(r.liquido, 10250 - 483 - 288.35);
  assert.equal(r.igss_patronal, 1067);
});

test('horas extra se pagan al 150% y son base de IGSS', () => {
  const r = calcularReciboMensual({ salarioBase: 4800, horasExtra: 10 });
  // valor hora = 4800 / 30 / 8 = 20 → 10 h * 20 * 1.5 = 300
  assert.equal(r.monto_horas_extra, 300);
  assert.equal(r.igss_laboral, Math.round(5100 * 0.0483 * 100) / 100);
});

test('días laborados parciales prorratean salario y bonificación', () => {
  const r = calcularReciboMensual({ salarioBase: 6000, diasLaborados: 15 });
  assert.equal(r.salario_devengado, 3000);
  assert.equal(r.bonificacion_incentivo, 125);
});

test('aguinaldo completo y proporcional', () => {
  const { inicio, fin } = periodoPrestacion('aguinaldo', 2026);
  const completo = calcularReciboPrestacion({
    salarioBase: 5000, fechaIngreso: '2020-01-01', inicioPeriodo: inicio, finPeriodo: fin,
  });
  assert.equal(completo.liquido, 5000);
  assert.equal(completo.igss_laboral, 0);

  const parcial = calcularReciboPrestacion({
    salarioBase: 3650, fechaIngreso: '2026-06-01', inicioPeriodo: inicio, finPeriodo: fin,
  });
  assert.equal(parcial.dias_laborados, 183);
  assert.equal(parcial.liquido, 1830);
});

const monto = (liq, concepto) => liq.ingresos.find((l) => l.concepto === concepto)?.monto ?? 0;

test('despido injustificado incluye indemnización con 1/6 de aguinaldo y Bono 14', () => {
  const liq = calcularLiquidacion({
    salarioBase: 6000, fechaIngreso: '2020-07-01', fechaBaja: '2026-06-30', motivo: 'despido_injustificado',
  });
  // 6 años con un solo 29 de febrero (2024) = 2191 días; base = 6000 + 1000 + 1000 = 8000
  assert.equal(liq.dias_laborados, 2191);
  assert.equal(monto(liq, 'Indemnización'), Math.round(8000 * (2191 / 365) * 100) / 100);
  // Bono 14: 1 jul 2025 – 30 jun 2026 completo
  assert.equal(monto(liq, 'Bono 14 proporcional'), 6000);
  // Aguinaldo: 1 dic 2025 – 30 jun 2026 = 212 días
  assert.equal(monto(liq, 'Aguinaldo proporcional'), Math.round((6000 * 212 / 365) * 100) / 100);
});

test('la renuncia no genera indemnización', () => {
  const liq = calcularLiquidacion({
    salarioBase: 6000, fechaIngreso: '2020-01-01', fechaBaja: '2026-03-15', motivo: 'renuncia',
  });
  assert.equal(monto(liq, 'Indemnización'), 0);
  assert.ok(liq.total > 0);
});

test('vacaciones pendientes desde el último aniversario', () => {
  assert.equal(ultimoAniversario('2020-05-10', '2026-03-01'), '2025-05-10');
  assert.equal(ultimoAniversario('2020-05-10', '2026-05-10'), '2026-05-10');
  assert.equal(ultimoAniversario('2026-02-01', '2026-03-01'), '2026-02-01');
  // 10 may 2025 – 9 may 2026 = 365 días → 15 días, menos 5 usados
  assert.equal(vacacionesPendientes({ fechaIngreso: '2020-05-10', fechaBaja: '2026-05-09', diasUsados: 5 }), 10);
});

test('salario pendiente paga bonificación y descuenta IGSS', () => {
  const liq = calcularLiquidacion({
    salarioBase: 3000, fechaIngreso: '2025-01-01', fechaBaja: '2026-01-15', motivo: 'renuncia',
    diasSalarioPendiente: 15, diasVacacionesPendientes: 0, otrosDescuentos: 200,
  });
  assert.equal(monto(liq, 'Salario pendiente'), 1500);
  assert.equal(monto(liq, 'Bonificación incentivo pendiente'), 125);
  assert.equal(liq.descuentos.find((d) => d.concepto === 'IGSS laboral').monto, 72.45);
  assert.equal(liq.total_descuentos, 272.45);
  assert.equal(liq.total, Math.round((liq.total_ingresos - 272.45) * 100) / 100);
});
