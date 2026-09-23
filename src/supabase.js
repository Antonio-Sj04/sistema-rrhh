import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && clave);

// "Mantener sesión iniciada": con la opción activa la sesión se guarda en
// localStorage (sobrevive al cerrar el navegador); sin ella, en sessionStorage
// (se pierde al cerrar el navegador y hay que volver a iniciar sesión).
const CLAVE_RECORDAR = 'rrhh:recordar-sesion';

function seguro(fn, alternativa = null) {
  try {
    return fn();
  } catch {
    return alternativa;
  }
}

export const recordarSesion = () => seguro(() => localStorage.getItem(CLAVE_RECORDAR) === '1', false);

export function fijarRecordarSesion(recordar) {
  seguro(() => (recordar ? localStorage.setItem(CLAVE_RECORDAR, '1') : localStorage.removeItem(CLAVE_RECORDAR)));
}

const almacenSesion = {
  getItem: (k) => seguro(() => (recordarSesion() ? localStorage : sessionStorage).getItem(k)),
  setItem: (k, v) => seguro(() => (recordarSesion() ? localStorage : sessionStorage).setItem(k, v)),
  removeItem: (k) => {
    seguro(() => localStorage.removeItem(k));
    seguro(() => sessionStorage.removeItem(k));
  },
};

export const supabase = configurado
  ? createClient(url, clave, { auth: { storage: almacenSesion, persistSession: true, autoRefreshToken: true } })
  : null;

/** Tabla del esquema "empresa" (datos internos). */
export const empresa = (tabla) => supabase.schema('empresa').from(tabla);

/** Tabla del esquema "reclutamiento" (datos de prospectos). */
export const reclutamiento = (tabla) => supabase.schema('reclutamiento').from(tabla);

/** Lanza el error de Supabase si lo hay; si no, devuelve los datos. */
export async function ok(consulta) {
  const { data, error, count } = await consulta;
  if (error) throw error;
  return count != null && data == null ? count : data;
}

/** URL temporal (1 hora) para descargar un archivo privado. */
export async function urlFirmada(bucket, ruta) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ruta, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Sube un archivo a Storage bajo carpeta/ y devuelve la ruta guardada. */
export async function subirArchivo(bucket, carpeta, archivo) {
  const limpio = archivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const ruta = `${carpeta}/${Date.now()}_${limpio}`;
  const { error } = await supabase.storage.from(bucket).upload(ruta, archivo, { upsert: false });
  if (error) throw error;
  return ruta;
}
