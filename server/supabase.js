// Clientes de Supabase del lado del servidor. Las claves viven solo en
// variables de entorno del backend (Netlify); nunca llegan al navegador.
import { createClient } from '@supabase/supabase-js';
import { ErrorHttp } from './http.js';

const env = (nombre, ...alternativas) =>
  [nombre, ...alternativas].map((n) => process.env[n]).find((v) => v) ?? '';

export const config = {
  get url() {
    return env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  },
  get clavePublica() {
    return env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  },
  get claveServicio() {
    return env('SUPABASE_SERVICE_ROLE_KEY');
  },
  get baseDatos() {
    return env('DATABASE_URL');
  },
};

const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function exigirConfiguracion() {
  if (!config.url || !config.clavePublica) {
    throw new ErrorHttp(500, 'CONFIGURACION', 'Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el servidor.');
  }
}

/** Cliente sin sesión (login, recuperación, portal público). */
export function clienteAnonimo() {
  exigirConfiguracion();
  return createClient(config.url, config.clavePublica, opciones);
}

/** Cliente que actúa como el usuario: todas las consultas pasan por RLS. */
export function clienteUsuario(token) {
  exigirConfiguracion();
  return createClient(config.url, config.clavePublica, {
    ...opciones,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Cliente con service_role: solo para tareas administrativas ya autorizadas. */
export function clienteServicio() {
  exigirConfiguracion();
  if (!config.claveServicio) {
    throw new ErrorHttp(503, 'SIN_CLAVE_SERVICIO', 'El servidor no tiene configurada SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(config.url, config.claveServicio, opciones);
}
