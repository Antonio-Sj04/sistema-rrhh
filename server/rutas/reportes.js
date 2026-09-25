// /api/v1/reportes/* — consultas SQL directas a PostgreSQL desde el backend.
// Si el servidor no tiene DATABASE_URL, se responde lo mismo usando la API de
// Supabase (también bajo RLS).
import { comoUsuario, hayConexionDirecta } from '../db.js';
import { ErrorHttp, errorDeBaseDatos, json } from '../http.js';
import { sanearTexto, validarLimite } from '../sanear.js';
import { exigirSesion, usuarioVerificado } from '../sesion.js';

const OPERACIONES = ['INSERT', 'UPDATE', 'DELETE'];
const TABLA = /^[a-z_]{1,40}$/;

/** Campos cuyo valor cambió entre dos versiones de un registro (JSONB). */
function camposCambiados(antes, despues) {
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  return [...claves].filter((k) => JSON.stringify(antes?.[k]) !== JSON.stringify(despues?.[k]));
}

async function resumen(sesion, usuario) {
  if (hayConexionDirecta()) {
    const [fila] = await comoUsuario(usuario, (sql) => sql`
      select
        (select count(*) from empresa.empleados where estado = 'activo')::int                     as empleados_activos,
        (select count(*) from empresa.ausencias where estado = 'pendiente')::int                  as ausencias_pendientes,
        (select count(*) from reclutamiento.vacantes where estado = 'abierta')::int               as vacantes_abiertas,
        (select count(*) from reclutamiento.postulaciones
          where created_at >= date_trunc('month', now()))::int                                    as postulaciones_mes`);
    return { ...fila, origen: 'sql' };
  }
  const contar = async (esquema, tabla, filtro) => {
    const { count, error } = await filtro(sesion.db.schema(esquema).from(tabla).select('id', { count: 'exact', head: true }));
    if (error) throw errorDeBaseDatos(error);
    return count ?? 0;
  };
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [a, b, c, d] = await Promise.all([
    contar('empresa', 'empleados', (q) => q.eq('estado', 'activo')),
    contar('empresa', 'ausencias', (q) => q.eq('estado', 'pendiente')),
    contar('reclutamiento', 'vacantes', (q) => q.eq('estado', 'abierta')),
    contar('reclutamiento', 'postulaciones', (q) => q.gte('created_at', inicioMes)),
  ]);
  return { empleados_activos: a, ausencias_pendientes: b, vacantes_abiertas: c, postulaciones_mes: d, origen: 'api' };
}

/**
 * Bitácora con búsqueda de texto dentro de los documentos JSONB (antes/después)
 * y cálculo en SQL de los campos modificados con jsonb_object_keys.
 */
async function bitacora(sesion, usuario, url) {
  const tabla = url.searchParams.get('tabla') || null;
  const operacion = url.searchParams.get('operacion') || null;
  const buscar = url.searchParams.get('buscar') ? sanearTexto(url.searchParams.get('buscar')).slice(0, 80) : null;
  const limite = validarLimite(url.searchParams.get('limite')) ?? 200;
  if (tabla && !TABLA.test(tabla)) throw new ErrorHttp(400, 'TABLA', 'Tabla inválida.');
  if (operacion && !OPERACIONES.includes(operacion)) throw new ErrorHttp(400, 'OPERACION', 'Operación inválida.');

  if (hayConexionDirecta()) {
    const filas = await comoUsuario(usuario, (sql) => sql`
      select a.id, a.esquema, a.tabla, a.operacion, a.registro_id, a.antes, a.despues, a.usuario_id, a.fecha,
             coalesce(
               (select array_agg(k order by k)
                  from jsonb_object_keys(coalesce(a.despues, '{}'::jsonb) || coalesce(a.antes, '{}'::jsonb)) as k
                 where a.antes -> k is distinct from a.despues -> k),
               '{}') as campos_cambiados
        from empresa.auditoria a
       where (${tabla}::text is null or a.tabla = ${tabla})
         and (${operacion}::text is null or a.operacion = ${operacion})
         and (${buscar}::text is null or coalesce(a.despues, a.antes)::text ilike '%' || ${buscar} || '%')
       order by a.fecha desc
       limit ${limite}`);
    return { datos: filas, origen: 'sql' };
  }

  let q = sesion.db.schema('empresa').from('auditoria').select('*').order('fecha', { ascending: false }).limit(limite);
  if (tabla) q = q.eq('tabla', tabla);
  if (operacion) q = q.eq('operacion', operacion);
  const { data, error } = await q;
  if (error) throw errorDeBaseDatos(error);
  const datos = data
    .map((f) => ({ ...f, campos_cambiados: camposCambiados(f.antes, f.despues) }))
    .filter((f) => !buscar || JSON.stringify(f.despues ?? f.antes).toLowerCase().includes(buscar.toLowerCase()));
  return { datos, origen: 'api' };
}

export async function manejarReportes(request, url, accion) {
  if (request.method !== 'GET') throw new ErrorHttp(405, 'METODO', 'Los reportes solo admiten GET.');
  const sesion = await exigirSesion(request);
  const usuario = await usuarioVerificado(sesion);
  try {
    if (accion === 'resumen') return json({ datos: await resumen(sesion, usuario) }, 200, sesion.cookies);
    if (accion === 'bitacora') return json(await bitacora(sesion, usuario, url), 200, sesion.cookies);
  } catch (e) {
    if (e instanceof ErrorHttp) throw e;
    throw errorDeBaseDatos(e);
  }
  throw new ErrorHttp(404, 'RUTA', 'Reporte no encontrado.');
}
