import { fijarRecordarSesion, supabase } from './supabase.js';

let sesion = null;
let perfil = null;
const oyentes = new Set();

export const obtenerSesion = () => sesion;
export const obtenerPerfil = () => perfil;

/** ¿El usuario actual tiene alguno de los roles indicados? */
export const tieneRol = (...roles) => Boolean(perfil && roles.includes(perfil.rol));

export const alCambiarAuth = (fn) => oyentes.add(fn);

async function cargarPerfil() {
  if (!sesion) {
    perfil = null;
    return;
  }
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', sesion.user.id).single();
  if (error) throw error;
  if (!data.activo) {
    await supabase.auth.signOut();
    throw new Error('Tu usuario está desactivado. Contacta al administrador.');
  }
  perfil = data;
}

export async function iniciarAuth() {
  const { data } = await supabase.auth.getSession();
  sesion = data.session;
  await cargarPerfil().catch(() => (perfil = null));

  supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
    const cambioUsuario = nuevaSesion?.user.id !== sesion?.user.id;
    sesion = nuevaSesion;
    if (evento === 'SIGNED_OUT' || cambioUsuario) {
      // No se debe esperar otra llamada a Supabase dentro de este callback
      setTimeout(async () => {
        await cargarPerfil().catch(() => (perfil = null));
        oyentes.forEach((fn) => fn(evento));
      });
    }
  });
}

export async function iniciarSesion(email, password, recordar = false) {
  // Se decide dónde guardar la sesión antes de crearla
  fijarRecordarSesion(recordar);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  sesion = data.session;
  await cargarPerfil();
}

/**
 * Cierra la sesión. Con todosLosDispositivos invalida también las sesiones
 * abiertas en otros equipos (dejan de funcionar al renovar su token, ≤ 1 hora).
 */
export async function cerrarSesion(todosLosDispositivos = false) {
  const { error } = await supabase.auth.signOut({ scope: todosLosDispositivos ? 'global' : 'local' });
  // Si el servidor no responde, la sesión local se borra de todos modos
  if (error) await supabase.auth.signOut({ scope: 'local' });
  fijarRecordarSesion(false);
  sesion = null;
  perfil = null;
}

/** URL a la que Supabase redirige en recuperación de contraseña e invitaciones. */
export const urlRecuperacion = () => `${location.origin}${location.pathname}?recuperar=1`;

export async function solicitarRecuperacion(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlRecuperacion() });
  if (error) throw error;
}

export async function cambiarPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Página de inicio según el rol. */
export function inicioPorRol() {
  if (!perfil) return '/login';
  return perfil.rol === 'empleado' ? '/mi-portal' : '/';
}
