// Utilidades HTTP: errores, respuestas JSON, cookies y protección CSRF.

export class ErrorHttp extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

const CABECERAS_SEGURIDAD = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** Respuesta JSON. "cookies" es una lista de cabeceras Set-Cookie. */
export function json(cuerpo, status = 200, cookies = []) {
  const headers = new Headers(CABECERAS_SEGURIDAD);
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(status === 204 ? null : JSON.stringify(cuerpo), { status, headers });
}

export const errorJson = (e, cookies = []) =>
  json({ error: { codigo: e.codigo ?? 'ERROR', mensaje: e.message } }, e.status ?? 500, cookies);

/** Traduce errores de PostgREST/PostgreSQL a códigos HTTP y mensajes claros. */
export function errorDeBaseDatos(error) {
  const c = error?.code ?? '';
  const m = error?.message ?? 'Error de base de datos';
  if (c === 'PGRST116') return new ErrorHttp(404, 'NO_ENCONTRADO', 'Registro no encontrado.');
  if (c === '42501' || /row-level security|permission denied/i.test(m)) return new ErrorHttp(403, 'PROHIBIDO', 'No tienes permiso para realizar esta acción.');
  if (c === '23505') return new ErrorHttp(409, 'DUPLICADO', m.includes('dpi') ? 'Ya existe un registro con ese DPI.' : 'Ya existe un registro con esos datos.');
  if (c === '23503') return new ErrorHttp(409, 'EN_USO', 'No se puede completar: hay registros relacionados.');
  if (['23514', '23502', '22P02', '22007', '22008', 'PGRST204', 'PGRST100', '42703'].includes(c)) return new ErrorHttp(400, 'DATOS_INVALIDOS', m);
  if (c === 'P0001') return new ErrorHttp(400, 'REGLA', m); // raise exception de nuestros triggers/funciones
  return new ErrorHttp(500, 'BASE_DATOS', m);
}

// ---------------------------------------------------------------------
// Cookies de sesión: HttpOnly (JavaScript no puede leerlas), Secure (solo
// HTTPS) y SameSite=Strict (el navegador no las envía desde otros sitios).
// ---------------------------------------------------------------------
export const COOKIE_ACCESO = 'rrhh_at';
export const COOKIE_RENOVACION = 'rrhh_rt';
export const COOKIE_RECORDAR = 'rrhh_rec';
const TREINTA_DIAS = 60 * 60 * 24 * 30;

export function leerCookies(request) {
  const cabecera = request.headers.get('cookie') ?? '';
  return Object.fromEntries(
    cabecera
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      }),
  );
}

export function cookie(nombre, valor, { maxAge } = {}) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, 'Path=/api', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  if (maxAge != null) partes.push(`Max-Age=${maxAge}`);
  return partes.join('; ');
}

/** Cookies para una sesión nueva o renovada de Supabase Auth. */
export function cookiesDeSesion(sesion, recordar) {
  const persistente = recordar ? { maxAge: TREINTA_DIAS } : {};
  return [
    cookie(COOKIE_ACCESO, sesion.access_token, { maxAge: sesion.expires_in ?? 3600 }),
    cookie(COOKIE_RENOVACION, sesion.refresh_token, persistente),
    cookie(COOKIE_RECORDAR, recordar ? '1' : '0', persistente),
  ];
}

export const cookiesBorradas = () =>
  [COOKIE_ACCESO, COOKIE_RENOVACION, COOKIE_RECORDAR].map((n) => cookie(n, '', { maxAge: 0 }));

/**
 * Protección CSRF (además de SameSite=Strict): toda petición que modifica
 * datos debe traer la cabecera X-Requested-With (un formulario de otro
 * sitio no puede enviarla sin CORS, y la API no habilita CORS) y, si el
 * navegador envía Origin, debe coincidir con el host de la API.
 */
export function verificarCsrf(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (request.headers.get('x-requested-with') !== 'fetch') {
    throw new ErrorHttp(403, 'CSRF', 'Solicitud rechazada (falta cabecera de seguridad).');
  }
  const origen = request.headers.get('origin');
  if (origen && new URL(origen).host !== new URL(request.url).host) {
    throw new ErrorHttp(403, 'CSRF', 'Solicitud rechazada (origen no permitido).');
  }
}

export async function leerJson(request) {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ErrorHttp(400, 'CONTENT_TYPE', 'Se esperaba Content-Type: application/json.');
  }
  try {
    return await request.json();
  } catch {
    throw new ErrorHttp(400, 'JSON', 'El cuerpo no es JSON válido.');
  }
}
