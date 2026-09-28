// Validación y sanitización de entradas de la API (defensa contra XSS e
// inyecciones). Funciones puras: se prueban en tests/sanear.test.js.
import { ErrorHttp } from './http.js';

const COLUMNA = /^[a-z_][a-z0-9_]{0,62}$/;
const SELECT = /^[a-zA-Z0-9_,:*()!\s.]{1,600}$/;
const EXPRESION_OR = /^[a-zA-Z0-9_.,():\s-]{1,400}$/;
const ETIQUETA_HTML = /<\/?[a-zA-Z!][^>]*>/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_TEXTO = 10000;

export const OPERADORES = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'ilike', 'is', 'or'];

/** Limpia un texto: quita caracteres de control y etiquetas HTML, recorta espacios. */
export function sanearTexto(valor) {
  const limpio = String(valor).replace(CONTROL, '').replace(ETIQUETA_HTML, '').trim();
  if (limpio.length > MAX_TEXTO) throw new ErrorHttp(400, 'TEXTO_LARGO', 'Un campo supera el largo permitido.');
  return limpio;
}

/** Sanea recursivamente un valor recibido en el cuerpo JSON. */
export function sanearValor(valor, profundidad = 0) {
  if (profundidad > 5) throw new ErrorHttp(400, 'ESTRUCTURA', 'Estructura de datos demasiado profunda.');
  if (valor === null || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new ErrorHttp(400, 'NUMERO', 'Número inválido.');
    return valor;
  }
  if (typeof valor === 'string') return sanearTexto(valor);
  if (Array.isArray(valor)) return valor.map((v) => sanearValor(v, profundidad + 1));
  if (typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => {
        if (!COLUMNA.test(k)) throw new ErrorHttp(400, 'CAMPO', `Nombre de campo inválido: ${k}`);
        return [k, sanearValor(v, profundidad + 1)];
      }),
    );
  }
  throw new ErrorHttp(400, 'TIPO', 'Tipo de dato no permitido.');
}

/** Valida el objeto (o arreglo de objetos) que se insertará o actualizará. */
export function validarDatos(datos) {
  const lista = Array.isArray(datos) ? datos : [datos];
  if (!lista.length || lista.length > 500) throw new ErrorHttp(400, 'DATOS', 'Se esperaban entre 1 y 500 registros.');
  for (const fila of lista) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila) || !Object.keys(fila).length) {
      throw new ErrorHttp(400, 'DATOS', 'Cada registro debe ser un objeto con al menos un campo.');
    }
  }
  return sanearValor(datos);
}

export function validarSelect(select) {
  if (select == null || select === '') return '*';
  if (!SELECT.test(select)) throw new ErrorHttp(400, 'SELECT', 'Selección de campos inválida.');
  return select;
}

export function validarColumna(nombre) {
  if (!COLUMNA.test(nombre ?? '')) throw new ErrorHttp(400, 'COLUMNA', `Columna inválida: ${nombre}`);
  return nombre;
}

/**
 * Filtros: arreglo de [columna, operador, valor].
 * El operador "or" recibe una expresión (p. ej. "estado.eq.activo,estado.eq.baja").
 */
export function validarFiltros(filtros) {
  if (filtros == null) return [];
  if (!Array.isArray(filtros) || filtros.length > 20) throw new ErrorHttp(400, 'FILTROS', 'Filtros inválidos.');
  return filtros.map((f) => {
    if (!Array.isArray(f) || f.length !== 3) throw new ErrorHttp(400, 'FILTROS', 'Cada filtro debe ser [columna, operador, valor].');
    const [columna, op, valor] = f;
    if (!OPERADORES.includes(op)) throw new ErrorHttp(400, 'OPERADOR', `Operador no permitido: ${op}`);
    if (op === 'or') {
      if (typeof valor !== 'string' || !EXPRESION_OR.test(valor)) throw new ErrorHttp(400, 'FILTROS', 'Expresión "or" inválida.');
      return ['or', 'or', valor];
    }
    validarColumna(columna);
    if (op === 'in') {
      if (!Array.isArray(valor) || valor.length > 200) throw new ErrorHttp(400, 'FILTROS', 'El operador "in" requiere una lista.');
      return [columna, op, valor.map((v) => sanearValor(v))];
    }
    if (op === 'is' && ![null, true, false].includes(valor)) throw new ErrorHttp(400, 'FILTROS', '"is" solo acepta null, true o false.');
    if (valor !== null && typeof valor === 'object') throw new ErrorHttp(400, 'FILTROS', 'Valor de filtro inválido.');
    return [columna, op, typeof valor === 'string' ? sanearTexto(valor) : valor];
  });
}

/** Orden: "campo.asc,otro.desc" → [[campo, asc], ...] */
export function validarOrden(orden) {
  if (!orden) return [];
  return String(orden)
    .split(',')
    .slice(0, 5)
    .map((parte) => {
      const [columna, dir = 'asc'] = parte.trim().split('.');
      if (!['asc', 'desc'].includes(dir)) throw new ErrorHttp(400, 'ORDEN', 'Dirección de orden inválida.');
      return [validarColumna(columna), dir];
    });
}

export function validarLimite(limite) {
  if (limite == null || limite === '') return null;
  const n = Number(limite);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new ErrorHttp(400, 'LIMITE', 'El límite debe estar entre 1 y 1000.');
  return n;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validarId(id) {
  // Casi todas las tablas usan UUID; parametros_nomina/configuracion usan 1 y auditoria bigint
  if (UUID.test(id) || /^\d{1,18}$/.test(id)) return id;
  throw new ErrorHttp(400, 'ID', 'Identificador inválido.');
}

export const esUuid = (v) => UUID.test(v ?? '');
export const CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
