import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularReciboMensual,
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
