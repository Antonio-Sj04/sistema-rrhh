import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enteroALetras, fechaLarga, quetzalesALetras } from '../src/lib/letras.js';

test('números básicos', () => {
  const casos = {
    0: 'CERO', 1: 'UNO', 15: 'QUINCE', 16: 'DIECISÉIS', 21: 'VEINTIUNO', 22: 'VEINTIDÓS', 30: 'TREINTA',
    31: 'TREINTA Y UNO', 99: 'NOVENTA Y NUEVE', 100: 'CIEN', 101: 'CIENTO UNO', 115: 'CIENTO QUINCE',
    500: 'QUINIENTOS', 999: 'NOVECIENTOS NOVENTA Y NUEVE',
  };
  for (const [n, texto] of Object.entries(casos)) assert.equal(enteroALetras(Number(n)), texto, n);
});

test('miles y millones con apócope', () => {
  assert.equal(enteroALetras(1000), 'MIL');
  assert.equal(enteroALetras(1001), 'MIL UNO');
  assert.equal(enteroALetras(21000), 'VEINTIÚN MIL');
  assert.equal(enteroALetras(31500), 'TREINTA Y UN MIL QUINIENTOS');
  assert.equal(enteroALetras(100000), 'CIEN MIL');
  assert.equal(enteroALetras(101000), 'CIENTO UN MIL');
  assert.equal(enteroALetras(1000000), 'UN MILLÓN');
  assert.equal(enteroALetras(2350000), 'DOS MILLONES TRESCIENTOS CINCUENTA MIL');
});

test('montos en quetzales', () => {
  assert.equal(quetzalesALetras(5000), 'CINCO MIL QUETZALES CON 00/100');
  assert.equal(quetzalesALetras(1), 'UN QUETZAL CON 00/100');
  assert.equal(quetzalesALetras(21), 'VEINTIÚN QUETZALES CON 00/100');
  assert.equal(quetzalesALetras(3750.5), 'TRES MIL SETECIENTOS CINCUENTA QUETZALES CON 50/100');
  assert.equal(quetzalesALetras(10250.99), 'DIEZ MIL DOSCIENTOS CINCUENTA QUETZALES CON 99/100');
  assert.equal(quetzalesALetras(1000000), 'UN MILLÓN DE QUETZALES CON 00/100');
});

test('fecha larga', () => {
  assert.equal(fechaLarga('2026-09-23'), '23 de septiembre de 2026');
  assert.equal(fechaLarga('2020-01-05'), '5 de enero de 2020');
});
