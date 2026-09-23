// Conversión de montos y fechas a texto en español (para constancias).

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIEZ_A_VEINTINUEVE = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0–999 en letras. "apocope" convierte UNO en UN (antes de MIL, MILLONES o QUETZALES). */
function centenas(n, apocope) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto;
  if (resto === 0) texto = '';
  else if (resto < 10) texto = UNIDADES[resto];
  else if (resto < 30) texto = DIEZ_A_VEINTINUEVE[resto - 10];
  else texto = DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` Y ${UNIDADES[resto % 10]}` : '');
  if (apocope) texto = texto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
  return [CENTENAS[c], texto].filter(Boolean).join(' ');
}

/** Entero en letras, hasta 999,999,999. */
export function enteroALetras(n, apocope = false) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${centenas(millones, true)} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${centenas(miles, true)} MIL`);
  if (resto) partes.push(centenas(resto, apocope));
  return partes.join(' ');
}

/** 5000.5 → "CINCO MIL QUETZALES CON 50/100" */
export function quetzalesALetras(monto) {
  const centavos = Math.round(Number(monto) * 100);
  const enteros = Math.floor(centavos / 100);
  const nombre = enteros === 1 ? 'QUETZAL' : 'QUETZALES';
  const exacto = enteros >= 1_000_000 && enteros % 1_000_000 === 0 ? ' DE' : '';
  return `${enteroALetras(enteros, true)}${exacto} ${nombre} CON ${String(centavos % 100).padStart(2, '0')}/100`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-09-23' → "23 de septiembre de 2026" */
export function fechaLarga(valor) {
  const [a, m, d] = String(valor).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
