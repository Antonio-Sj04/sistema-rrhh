// /api/v1/auth/* — autenticación con Supabase Auth. Los tokens se guardan
// solo en cookies HttpOnly; el navegador nunca los recibe en el cuerpo.
import { ErrorHttp, cookiesBorradas, cookiesDeSesion, json, leerJson } from '../http.js';
import { CORREO, sanearTexto } from '../sanear.js';
import { obtenerSesion, exigirSesion, tokenCsrf } from '../sesion.js';
import { clienteAnonimo, clienteUsuario, config } from '../supabase.js';

const TIPOS_ENLACE = ['invite', 'recovery', 'email_change', 'signup', 'magiclink'];

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72
    || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new ErrorHttp(400, 'PASSWORD_DEBIL', 'La contraseña debe tener mínimo 8 caracteres, con al menos una mayúscula, una minúscula y un número.');
  }
  return password;
}

async function perfilDe(token, userId) {
  const { data, error } = await clienteUsuario(token).from('perfiles').select('*').eq('id', userId).single();
  if (error) throw new ErrorHttp(403, 'SIN_PERFIL', 'Tu usuario no tiene perfil en el sistema.');
  if (!data.activo) throw new ErrorHttp(403, 'INACTIVO', 'Tu usuario está desactivado. Contacta al administrador.');
  return data;
}

/**
 * Cambia la contraseña del usuario dueño del token llamando a Supabase Auth
 * (PUT /auth/v1/user). No se usa auth.updateUser() de supabase-js porque exige
 * una sesión guardada dentro de la librería, y aquí la sesión vive en cookies.
 */
async function cambiarPassword(token, password) {
  const respuesta = await fetch(`${config.url}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: config.clavePublica, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (respuesta.ok) return;
  const error = await respuesta.json().catch(() => ({}));
  const codigo = error.error_code ?? error.code ?? '';
  const detalle = error.msg ?? error.message ?? '';
  if (codigo === 'same_password' || /different/i.test(detalle)) {
    throw new ErrorHttp(400, 'PASSWORD', 'La nueva contraseña debe ser distinta de la anterior.');
  }
  if (codigo === 'weak_password') {
    throw new ErrorHttp(400, 'PASSWORD_DEBIL', 'La contraseña no cumple los requisitos de seguridad.');
  }
  if (respuesta.status === 401 || respuesta.status === 403) {
    throw new ErrorHttp(401, 'NO_AUTENTICADO', 'El enlace expiró. Solicita uno nuevo desde «¿Olvidaste tu contraseña?».');
  }
  console.error('Supabase Auth rechazó el cambio de contraseña:', respuesta.status, codigo, detalle);
  throw new ErrorHttp(400, 'PASSWORD', 'No se pudo guardar la contraseña. Inténtalo de nuevo.');
}

export async function manejarAuth(request, accion) {
  // POST /auth/login  { email, password, recordar }
  if (accion === 'login' && request.method === 'POST') {
    const { email, password, recordar } = await leerJson(request);
    const correo = sanearTexto(email ?? '').toLowerCase();
    if (!CORREO.test(correo) || typeof password !== 'string' || !password) {
      throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe tu correo y tu contraseña.');
    }
    const { data, error } = await clienteAnonimo().auth.signInWithPassword({ email: correo, password });
    if (error || !data.session) {
      throw new ErrorHttp(401, 'CREDENCIALES', /confirm/i.test(error?.message ?? '')
        ? 'Debes confirmar tu correo antes de ingresar.'
        : 'Correo o contraseña incorrectos.');
    }
    const perfil = await perfilDe(data.session.access_token, data.user.id);
    return json({ usuario: { id: data.user.id, email: data.user.email }, perfil, csrf: tokenCsrf(data.session.access_token) }, 200,
      cookiesDeSesion(data.session, Boolean(recordar)));
  }

  // GET /auth/sesion — ¿hay sesión? devuelve el perfil (y renueva cookies si hace falta)
  if (accion === 'sesion' && request.method === 'GET') {
    const sesion = await obtenerSesion(request);
    if (!sesion?.token) return json({ usuario: null, perfil: null }, 200, sesion?.cookies ?? []);
    const { data } = await sesion.db.auth.getUser(sesion.token);
    if (!data?.user) return json({ usuario: null, perfil: null }, 200, cookiesBorradas());
    try {
      const perfil = await perfilDe(sesion.token, data.user.id);
      return json({ usuario: { id: data.user.id, email: data.user.email }, perfil, csrf: tokenCsrf(sesion.token) }, 200, sesion.cookies);
    } catch (e) {
      e.cookies = cookiesBorradas();
      throw e;
    }
  }

  // POST /auth/logout  { todos }
  if (accion === 'logout' && request.method === 'POST') {
    const { todos } = await leerJson(request).catch(() => ({}));
    const sesion = await obtenerSesion(request);
    // Revoca el token de renovación (scope global: en todos los dispositivos)
    if (sesion?.token) {
      await clienteAnonimo().auth.admin.signOut(sesion.token, todos ? 'global' : 'local').catch(() => {});
    }
    return json({ ok: true }, 200, cookiesBorradas());
  }

  // POST /auth/recuperar  { email } — siempre responde 200 para no revelar si el correo existe
  if (accion === 'recuperar' && request.method === 'POST') {
    const { email } = await leerJson(request);
    const correo = sanearTexto(email ?? '').toLowerCase();
    if (!CORREO.test(correo)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe un correo válido.');
    await clienteAnonimo().auth.resetPasswordForEmail(correo, { redirectTo: new URL('/', request.url).href });
    return json({ ok: true });
  }

  // POST /auth/verificar  { token_hash, type } — enlaces de invitación y recuperación
  if (accion === 'verificar' && request.method === 'POST') {
    const { token_hash: tokenHash, type } = await leerJson(request);
    if (typeof tokenHash !== 'string' || tokenHash.length > 200 || !TIPOS_ENLACE.includes(type)) {
      throw new ErrorHttp(400, 'ENLACE', 'Enlace inválido.');
    }
    const { data, error } = await clienteAnonimo().auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.session) throw new ErrorHttp(400, 'ENLACE_VENCIDO', 'El enlace expiró o ya fue usado.');
    return json({ tipo: type }, 200, cookiesDeSesion(data.session, false));
  }

  // PUT /auth/password  { password } — requiere sesión (p. ej. tras un enlace de invitación)
  if (accion === 'password' && request.method === 'PUT') {
    const sesion = await exigirSesion(request);
    const { password } = await leerJson(request);
    await cambiarPassword(sesion.token, validarPassword(password));
    return json({ ok: true }, 200, sesion.cookies);
  }

  throw new ErrorHttp(404, 'RUTA', 'Ruta de autenticación no encontrada.');
}
