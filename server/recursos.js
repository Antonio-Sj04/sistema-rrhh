// Recursos REST genéricos: /api/v1/{recurso}[/{id}]
// Solo los recursos de esta lista blanca existen en la API. Todas las
// consultas se ejecutan con el token del usuario, por lo que RLS decide
// qué filas puede ver o modificar.
import { ErrorHttp, errorDeBaseDatos, json, leerJson } from './http.js';
import {
  validarDatos, validarFiltros, validarId, validarLimite, validarOrden, validarSelect,
} from './sanear.js';

const TODOS = ['GET', 'POST', 'PUT', 'DELETE'];

export const RECURSOS = {
  // Base de datos de la empresa
  departamentos: { esquema: 'empresa', metodos: TODOS },
  puestos: { esquema: 'empresa', metodos: TODOS },
  empleados: { esquema: 'empresa', metodos: TODOS },
  contratos: { esquema: 'empresa', metodos: TODOS },
  ausencias: { esquema: 'empresa', metodos: TODOS },
  evaluaciones: { esquema: 'empresa', metodos: TODOS },
  documentos_empleado: { esquema: 'empresa', metodos: TODOS },
  parametros_nomina: { esquema: 'empresa', metodos: ['GET', 'PUT'] },
  periodos_nomina: { esquema: 'empresa', metodos: TODOS },
  recibos_nomina: { esquema: 'empresa', metodos: TODOS },
  liquidaciones: { esquema: 'empresa', metodos: TODOS },
  configuracion: { esquema: 'empresa', metodos: ['GET', 'PUT'] },
  constancias: { esquema: 'empresa', metodos: ['GET', 'POST'] },
  auditoria: { esquema: 'empresa', metodos: ['GET'] },
  // Base de datos de reclutamiento (prospectos)
  vacantes: { esquema: 'reclutamiento', metodos: TODOS },
  postulantes: { esquema: 'reclutamiento', metodos: TODOS },
  educacion: { esquema: 'reclutamiento', metodos: TODOS },
  experiencia: { esquema: 'reclutamiento', metodos: TODOS },
  referencias: { esquema: 'reclutamiento', metodos: TODOS },
  antecedentes: { esquema: 'reclutamiento', metodos: TODOS },
  postulaciones: { esquema: 'reclutamiento', metodos: TODOS },
  entrevistas: { esquema: 'reclutamiento', metodos: TODOS },
  // Usuarios del sistema (solo lectura y edición; altas y bajas en /usuarios)
  perfiles: { esquema: 'public', metodos: ['GET', 'PUT'] },
};

function parsearFiltros(url) {
  const crudo = url.searchParams.get('filtros');
  if (!crudo) return [];
  try {
    return validarFiltros(JSON.parse(crudo));
  } catch (e) {
    if (e instanceof ErrorHttp) throw e;
    throw new ErrorHttp(400, 'FILTROS', 'El parámetro "filtros" no es JSON válido.');
  }
}

function aplicarFiltros(consulta, filtros) {
  for (const [columna, op, valor] of filtros) {
    consulta = op === 'or' ? consulta.or(valor) : consulta[op](columna, valor);
  }
  return consulta;
}

/**
 * GET    /{recurso}          lista (filtros, orden, límite, conteo)
 * GET    /{recurso}/{id}     un registro (404 si no existe o no es visible)
 * POST   /{recurso}          crea (201); con "conflicto" hace upsert
 * PUT    /{recurso}/{id}     actualiza un registro
 * PUT    /{recurso}?filtros  actualiza los registros filtrados
 * DELETE /{recurso}/{id}     elimina un registro
 * DELETE /{recurso}?filtros  elimina los registros filtrados (exige filtros)
 */
export async function manejarRecurso(request, url, nombre, id, sesion) {
  const recurso = RECURSOS[nombre];
  if (!recurso) throw new ErrorHttp(404, 'RECURSO', `El recurso "${nombre}" no existe.`);
  if (!recurso.metodos.includes(request.method)) {
    throw new ErrorHttp(405, 'METODO', `Método ${request.method} no permitido en /${nombre}.`);
  }

  const tabla = sesion.db.schema(recurso.esquema).from(nombre);
  const select = validarSelect(url.searchParams.get('select'));
  let filtros = parsearFiltros(url);
  if (id) filtros = [['id', 'eq', validarId(id)], ...filtros];

  if (request.method === 'GET') {
    if (url.searchParams.get('conteo') === '1') {
      const { count, error } = await aplicarFiltros(tabla.select('id', { count: 'exact', head: true }), filtros);
      if (error) throw errorDeBaseDatos(error);
      return json({ total: count ?? 0 }, 200, sesion.cookies);
    }
    let consulta = aplicarFiltros(tabla.select(select), filtros);
    for (const [columna, dir] of validarOrden(url.searchParams.get('orden'))) {
      consulta = consulta.order(columna, { ascending: dir === 'asc' });
    }
    const limite = validarLimite(url.searchParams.get('limite'));
    if (limite) consulta = consulta.limit(limite);

    const unico = id ? 'uno' : url.searchParams.get('unico');
    if (unico === 'uno') consulta = consulta.single();
    if (unico === 'quizas') consulta = consulta.maybeSingle();
    const { data, error } = await consulta;
    if (error) throw errorDeBaseDatos(error);
    return json({ datos: data }, 200, sesion.cookies);
  }

  if (request.method === 'POST') {
    const cuerpo = await leerJson(request);
    const datos = validarDatos(cuerpo.datos);
    const conflicto = cuerpo.conflicto ? String(cuerpo.conflicto).split(',').map((c) => c.trim()) : null;
    if (conflicto) conflicto.forEach((c) => validarSelect(c));
    let consulta = conflicto ? tabla.upsert(datos, { onConflict: conflicto.join(',') }) : tabla.insert(datos);
    if (cuerpo.select) consulta = consulta.select(validarSelect(cuerpo.select));
    const { data, error } = await consulta;
    if (error) throw errorDeBaseDatos(error);
    return json({ datos: data ?? null }, 201, sesion.cookies);
  }

  if (!filtros.length) {
    throw new ErrorHttp(400, 'SIN_FILTROS', 'Para modificar o eliminar se requiere un id o filtros.');
  }

  if (request.method === 'PUT') {
    const cuerpo = await leerJson(request);
    const datos = validarDatos(cuerpo.datos);
    if (Array.isArray(datos)) throw new ErrorHttp(400, 'DATOS', 'PUT recibe un solo objeto.');
    delete datos.id; // el id nunca se modifica
    let consulta = aplicarFiltros(tabla.update(datos), filtros);
    if (cuerpo.select) consulta = consulta.select(validarSelect(cuerpo.select));
    const { data, error } = await consulta;
    if (error) throw errorDeBaseDatos(error);
    return json({ datos: data ?? null }, 200, sesion.cookies);
  }

  // DELETE
  const { error } = await aplicarFiltros(tabla.delete(), filtros);
  if (error) throw errorDeBaseDatos(error);
  return json({ ok: true }, 200, sesion.cookies);
}
