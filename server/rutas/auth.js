// /api/v1/auth/* — autenticación con Supabase Auth. Los tokens se guardan
// solo en cookies HttpOnly; el navegador nunca los recibe en el cuerpo.
import { ErrorHttp, cookiesBorradas, cookiesDeSesion, json, leerJson } from '../http.js';
import { CORREO, sanearTexto } from '../sanear.js';
import { obtenerSesion, exigirSesion } from '../sesion.js';
import { clienteAnonimo, clienteUsuario } from '../supabase.js';

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
    return json({ usuario: { id: data.user.id, email: data.user.email }, perfil }, 200, cookiesDeSesion(data.session, Boolean(recordar)));
  }

  // GET /auth/sesion — ¿hay sesión? devuelve el perfil (y renueva cookies si hace falta)
  if (accion === 'sesion' && request.method === 'GET') {
    const sesion = await obtenerSesion(request);
    if (!sesion?.token) return json({ usuario: null, perfil: null }, 200, sesion?.cookies ?? []);
    const { data } = await sesion.db.auth.getUser(sesion.token);
    if (!data?.user) return json({ usuario: null, perfil: null }, 200, cookiesBorradas());
    try {
      const perfil = await perfilDe(sesion.token, data.user.id);
      return json({ usuario: { id: data.user.id, email: data.user.email }, perfil }, 200, sesion.cookies);
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
    const { error } = await sesion.db.auth.updateUser({ password: validarPassword(password) });
    if (error) {
      throw new ErrorHttp(400, 'PASSWORD', /different/i.test(error.message)
        ? 'La nueva contraseña debe ser distinta de la anterior.'
        : 'La contraseña no cumple los requisitos de seguridad.');
    }
    return json({ ok: true }, 200, sesion.cookies);
  }

  throw new ErrorHttp(404, 'RUTA', 'Ruta de autenticación no encontrada.');
}
