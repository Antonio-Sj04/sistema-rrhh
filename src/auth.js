// Estado de autenticación del cliente. El token de sesión vive en una cookie
// HttpOnly que administra la API; aquí solo se guarda el perfil en memoria.
import { api } from './api.js';

let usuario = null;
let perfil = null;
const oyentes = new Set();

/** { user: { id, email } } si hay sesión; null si no. */
export const obtenerSesion = () => (usuario ? { user: usuario } : null);
export const obtenerPerfil = () => perfil;

/** ¿El usuario actual tiene alguno de los roles indicados? */
export const tieneRol = (...roles) => Boolean(perfil && roles.includes(perfil.rol));

export const alCambiarAuth = (fn) => oyentes.add(fn);

function fijar(datos) {
  usuario = datos?.usuario ?? null;
  perfil = datos?.perfil ?? null;
}

/** Consulta a la API si hay una sesión activa (cookie HttpOnly). */
export async function iniciarAuth() {
  try {
    fijar(await api('/auth/sesion'));
  } catch {
    fijar(null);
  }
  // Si la API responde 401 en cualquier petición, la sesión terminó
  window.addEventListener('sesion-expirada', () => {
    if (!usuario) return;
    fijar(null);
    oyentes.forEach((fn) => fn('SIGNED_OUT'));
  });
}

export async function iniciarSesion(email, password, recordar = false) {
  fijar(await api('/auth/login', { metodo: 'POST', cuerpo: { email, password, recordar } }));
}

/** Cierra la sesión; con todosLosDispositivos revoca también las demás. */
export async function cerrarSesion(todosLosDispositivos = false) {
  await api('/auth/logout', { metodo: 'POST', cuerpo: { todos: todosLosDispositivos } }).catch(() => {});
  fijar(null);
}

export async function solicitarRecuperacion(email) {
  await api('/auth/recuperar', { metodo: 'POST', cuerpo: { email } });
}

/** Valida el enlace de un correo (invitación, recuperación) y abre la sesión. */
export async function verificarEnlace(tokenHash, tipo) {
  await api('/auth/verificar', { metodo: 'POST', cuerpo: { token_hash: tokenHash, type: tipo } });
  fijar(await api('/auth/sesion'));
}

export async function cambiarPassword(password) {
  await api('/auth/password', { metodo: 'PUT', cuerpo: { password } });
}

/** Página de inicio según el rol. */
export function inicioPorRol() {
  if (!perfil) return '/login';
  return perfil.rol === 'empleado' ? '/mi-portal' : '/';
}
