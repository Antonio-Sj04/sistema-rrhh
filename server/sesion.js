// Sesión del usuario a partir de las cookies HttpOnly. Si el token de acceso
// venció, se renueva con el de renovación y se emiten cookies nuevas.
import {
  COOKIE_ACCESO, COOKIE_RECORDAR, COOKIE_RENOVACION, ErrorHttp, cookiesBorradas, cookiesDeSesion, leerCookies,
} from './http.js';
import { clienteAnonimo, clienteUsuario } from './supabase.js';

function expiraPronto(jwt) {
  try {
    const carga = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    return !carga.exp || carga.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

/**
 * Devuelve { token, db, cookies } o null si no hay sesión.
 * "cookies" trae las Set-Cookie a enviar si hubo renovación o hay que borrarlas.
 */
export async function obtenerSesion(request) {
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
