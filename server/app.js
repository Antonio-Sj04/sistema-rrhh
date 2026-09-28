// API REST del Sistema RRHH — /api/v1
//
//   /auth/{login|logout|sesion|recuperar|verificar|password}
//   /usuarios[/{id}]                       alta (invitación) y baja de cuentas (admin)
//   /archivos/{bucket}[/url]               subir, descargar y borrar archivos
//   /postulaciones/{id}/contratar          convierte al postulante en empleado
//   /reportes/{resumen|bitacora}           consultas SQL directas (JSONB)
//   /publico/{vacantes|empresa|postulaciones}  portal de empleo (sin sesión)
//   /{recurso}[/{id}]                      CRUD REST genérico (ver recursos.js)
import { ErrorHttp, errorDeBaseDatos, errorJson, json, leerJson, verificarCsrf } from './http.js';
import { manejarRecurso } from './recursos.js';
import { manejarArchivos } from './rutas/archivos.js';
import { manejarAuth } from './rutas/auth.js';
import { manejarPublico } from './rutas/publico.js';
import { manejarReportes } from './rutas/reportes.js';
import { manejarUsuarios } from './rutas/usuarios.js';
import { esUuid } from './sanear.js';
import { exigirSesion } from './sesion.js';

/** Extrae los segmentos de la ruta después de /api/v1/ (o del nombre de la función). */
export function segmentos(url) {
  const ruta = url.pathname.replace(/^.*?\/(api\/v1|\.netlify\/functions\/api)\/?/, '');
  return ruta.split('/').filter(Boolean).map(decodeURIComponent);
}

async function contratar(request, id) {
  if (request.method !== 'POST' || !esUuid(id)) throw new ErrorHttp(404, 'RUTA', 'Ruta no encontrada.');
  const sesion = await exigirSesion(request);
  const d = await leerJson(request);
  const { data, error } = await sesion.db.schema('reclutamiento').rpc('contratar', {
    p_postulacion: id,
    p_puesto: d.puesto_id,
    p_departamento: d.departamento_id,
    p_salario: Number(d.salario),
    p_fecha_ingreso: d.fecha_ingreso,
  });
  if (error) throw error.message === 'No autorizado' ? new ErrorHttp(403, 'PROHIBIDO', 'No tienes permiso para contratar.') : errorDeBaseDatos(error);
  return json({ datos: { empleado_id: data } }, 201, sesion.cookies);
}

/** Punto de entrada: recibe un Request estándar y devuelve un Response. */
export async function manejar(request, { ip } = {}) {
  const url = new URL(request.url);
  try {
    verificarCsrf(request);
    const [primero, segundo, tercero, cuarto] = segmentos(url);
    if (!primero) return json({ nombre: 'API Sistema RRHH', version: 'v1' });

    switch (primero) {
      case 'auth':
        return await manejarAuth(request, segundo);
      case 'usuarios':
        return await manejarUsuarios(request, segundo);
      case 'archivos':
        return await manejarArchivos(request, url, segundo, tercero);
      case 'publico':
        return await manejarPublico(request, segundo, ip);
      case 'reportes':
        return await manejarReportes(request, url, segundo);
      case 'postulaciones':
        if (tercero === 'contratar' && !cuarto) return await contratar(request, segundo);
      // falls through: el resto de /postulaciones es CRUD
      default: {
        if (tercero) throw new ErrorHttp(404, 'RUTA', 'Ruta no encontrada.');
        const sesion = await exigirSesion(request);
        return await manejarRecurso(request, url, primero, segundo, sesion);
      }
    }
  } catch (e) {
    if (e instanceof ErrorHttp) return errorJson(e, e.cookies ?? []);
    console.error('Error no controlado en la API:', e);
    return errorJson(new ErrorHttp(500, 'INTERNO', 'Ocurrió un error inesperado. Inténtalo de nuevo.'));
  }
}
