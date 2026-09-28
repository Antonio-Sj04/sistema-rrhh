// Sesión del usuario a partir de las cookies HttpOnly. Si el token de acceso
// venció, se renueva con el de renovación y se emiten cookies nuevas.
import {
  COOKIE_ACCESO, COOKIE_RECORDAR, COOKIE_RENOVACION, ErrorHttp, cookiesBorradas, cookiesDeSesion, leerCookies,
} from './http.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { clienteAnonimo, clienteUsuario, config } from './supabase.js';

const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

function cargaJwt(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  } catch {
    return {};
  }
}

/**
 * Token anti-CSRF (patrón "synchronizer token" sin estado): HMAC del id de la
 * sesión de Supabase con un secreto del servidor. No cambia al renovar el JWT.
 * El cliente lo recibe en /auth/login y /auth/sesion, lo guarda en memoria y
 * lo reenvía en la cabecera X-CSRF-Token; otro sitio no puede leerlo.
 */
export function tokenCsrf(jwt) {
  const { session_id: idSesion, sub } = cargaJwt(jwt);
  const secreto = process.env.CSRF_SECRET || config.claveServicio || config.clavePublica;
  return createHmac('sha256', secreto).update(`csrf:${idSesion ?? sub ?? ''}`).digest('base64url');
}

function verificarTokenCsrf(request, jwt) {
  const recibido = Buffer.from(request.headers.get('x-csrf-token') ?? '');
  const esperado = Buffer.from(tokenCsrf(jwt));
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    throw new ErrorHttp(403, 'CSRF', 'Solicitud rechazada (token CSRF inválido). Recarga la página.');
  }
}

/** Token enviado en "Authorization: Bearer" (clientes como Postman o curl). */
function tokenBearer(request) {
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(request.headers.get('authorization') ?? '');
  return m?.[1] ?? null;
}

function expiraPronto(jwt) {
  const { exp } = cargaJwt(jwt);
  return !exp || exp * 1000 < Date.now() + 30_000;
}

/**
 * Devuelve { token, db, cookies, porCookie } o null si no hay sesión.
 * "cookies" trae las Set-Cookie a enviar si hubo renovación o hay que borrarlas.
 */
export async function obtenerSesion(request) {
  const bearer = tokenBearer(request);
  if (bearer) {
    // Sin cookies: el navegador no lo adjunta solo, así que no aplica CSRF
    if (expiraPronto(bearer)) return null;
    return { token: bearer, db: clienteUsuario(bearer), cookies: [], porCookie: false };
  }
  const sesion = await sesionDeCookies(request);
  if (sesion) sesion.porCookie = true;
  return sesion;
}

async function sesionDeCookies(request) {
  const c = leerCookies(request);
  if (c[COOKIE_ACCESO] && !expiraPronto(c[COOKIE_ACCESO])) {
    return { token: c[COOKIE_ACCESO], db: clienteUsuario(c[COOKIE_ACCESO]), cookies: [] };
  }
  if (!c[COOKIE_RENOVACION]) return null;

  const { data, error } = await clienteAnonimo().auth.refreshSession({ refresh_token: c[COOKIE_RENOVACION] });
  if (error || !data.session) return { token: null, cookies: cookiesBorradas() };
  const token = data.session.access_token;
  return { token, db: clienteUsuario(token), cookies: cookiesDeSesion(data.session, c[COOKIE_RECORDAR] === '1') };
}

/** Igual que obtenerSesion, pero responde 401 si no hay sesión válida. */
export async function exigirSesion(request) {
  const sesion = await obtenerSesion(request);
  if (!sesion?.token) {
    const e = new ErrorHttp(401, 'NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
    e.cookies = sesion?.cookies ?? [];
    throw e;
  }
  // Toda modificación hecha con la cookie de sesión debe traer el token CSRF
  if (sesion.porCookie && !METODOS_SEGUROS.includes(request.method)) verificarTokenCsrf(request, sesion.token);
  return sesion;
}

/** Usuario verificado por Supabase Auth (valida la firma del token). */
export async function usuarioVerificado(sesion) {
  const { data, error } = await sesion.db.auth.getUser(sesion.token);
  if (error || !data.user) throw new ErrorHttp(401, 'NO_AUTENTICADO', 'Sesión inválida.');
  return data.user;
}

export async function exigirRol(sesion, ...roles) {
  const { data } = await sesion.db.rpc('tiene_rol', { roles });
  if (!data) throw new ErrorHttp(403, 'PROHIBIDO', 'No tienes permiso para realizar esta acción.');
}
