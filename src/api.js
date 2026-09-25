// Cliente de la API REST propia (/api/v1). Todas las peticiones usan
// fetch + async/await; la sesión viaja en cookies HttpOnly que el navegador
// adjunta solo (JavaScript no puede leerlas).

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.code = codigo;
  }
}

/** Petición a la API. Lanza ErrorApi si la respuesta no es 2xx. */
export async function api(ruta, { metodo = 'GET', cuerpo, formulario, parametros } = {}) {
  const url = new URL(`/api/v1${ruta}`, location.origin);
  for (const [clave, valor] of Object.entries(parametros ?? {})) {
    if (valor != null && valor !== '') url.searchParams.set(clave, valor);
  }
  // Cabecera exigida por la API contra CSRF (un sitio ajeno no puede enviarla)
  const headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
  let body;
  if (formulario) {
    body = formulario;
  } else if (cuerpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(url, { method: metodo, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ErrorApi(0, 'RED', 'No hay conexión con el servidor.');
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !ruta.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('sesion-expirada'));
    }
    throw new ErrorApi(respuesta.status, datos?.error?.codigo, datos?.error?.mensaje ?? `Error ${respuesta.status}`);
  }
  return datos;
}

// ---------------------------------------------------------------------
// Constructor de consultas: empresa('empleados').select('*').eq('estado', 'activo')
// se traduce a GET /api/v1/empleados?select=*&filtros=[["estado","eq","activo"]]
// ---------------------------------------------------------------------
class Consulta {
  constructor(recurso) {
    this.recurso = recurso;
    this.operacion = 'select';
    this.filtros = [];
    this.orden = [];
    this.seleccion = null;
  }

  select(columnas = '*', opciones = {}) {
    if (['insert', 'update'].includes(this.operacion)) {
      this.retorno = columnas; // columnas a devolver tras insertar/actualizar
    } else {
      this.operacion = 'select';
      this.seleccion = columnas;
      if (opciones.count && opciones.head) this.conteo = true;
    }
    return this;
  }

  insert(datos) {
    this.operacion = 'insert';
    this.datos = datos;
    return this;
  }

  upsert(datos, { onConflict } = {}) {
    this.insert(datos);
    this.conflicto = onConflict;
    return this;
  }

  update(datos) {
    this.operacion = 'update';
    this.datos = datos;
    return this;
  }

  delete() {
    this.operacion = 'delete';
    return this;
  }

  filtro(columna, op, valor) {
    this.filtros.push([columna, op, valor]);
    return this;
  }

  eq(c, v) { return this.filtro(c, 'eq', v); }
  neq(c, v) { return this.filtro(c, 'neq', v); }
  gt(c, v) { return this.filtro(c, 'gt', v); }
  gte(c, v) { return this.filtro(c, 'gte', v); }
  lt(c, v) { return this.filtro(c, 'lt', v); }
  lte(c, v) { return this.filtro(c, 'lte', v); }
  in(c, v) { return this.filtro(c, 'in', v); }
  ilike(c, v) { return this.filtro(c, 'ilike', v); }
  is(c, v) { return this.filtro(c, 'is', v); }
  or(expresion) { return this.filtro('or', 'or', expresion); }

  order(columna, { ascending = true } = {}) {
    this.orden.push(`${columna}.${ascending ? 'asc' : 'desc'}`);
    return this;
  }

  limit(n) {
    this.limite = n;
    return this;
  }

  single() {
    this.unico = 'uno';
    return this;
  }

  maybeSingle() {
    this.unico = 'quizas';
    return this;
  }

  /** Si el único filtro es por id, se usa la forma REST /recurso/{id}. */
  ruta() {
    const [f] = this.filtros;
    const porId = this.filtros.length === 1 && f[0] === 'id' && f[1] === 'eq'
      && (this.operacion !== 'select' || this.unico === 'uno');
    return porId
      ? { ruta: `/${this.recurso}/${encodeURIComponent(f[2])}`, filtros: [] }
      : { ruta: `/${this.recurso}`, filtros: this.filtros };
  }

  async ejecutar() {
    const { ruta, filtros } = this.ruta();
    const parametros = { filtros: filtros.length ? JSON.stringify(filtros) : null };
    try {
      if (this.operacion === 'select') {
        const r = await api(ruta, {
          parametros: {
            ...parametros,
            select: this.seleccion,
            orden: this.orden.join(',') || null,
            limite: this.limite,
            unico: ruta.split('/').length > 2 ? null : this.unico,
            conteo: this.conteo ? '1' : null,
          },
        });
        return this.conteo ? { data: null, count: r.total, error: null } : { data: r.datos, error: null };
      }
      if (this.operacion === 'insert') {
        const r = await api(ruta, { metodo: 'POST', cuerpo: { datos: this.datos, select: this.retorno, conflicto: this.conflicto } });
        return { data: r.datos, error: null };
      }
      if (this.operacion === 'update') {
        const r = await api(ruta, { metodo: 'PUT', parametros, cuerpo: { datos: this.datos, select: this.retorno } });
        return { data: r.datos, error: null };
      }
      await api(ruta, { metodo: 'DELETE', parametros });
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  then(resolver, rechazar) {
    return this.ejecutar().then(resolver, rechazar);
  }
}

/** Recursos de la base de datos de la empresa. */
export const empresa = (recurso) => new Consulta(recurso);
/** Recursos de la base de datos de reclutamiento (prospectos). */
export const reclutamiento = (recurso) => new Consulta(recurso);
/** Otros recursos (p. ej. perfiles de usuario). */
export const recurso = (nombre) => new Consulta(nombre);

/** Lanza el error de la consulta si lo hay; si no, devuelve los datos. */
export async function ok(consulta) {
  const { data, error, count } = await consulta;
  if (error) throw error;
  return count != null && data == null ? count : data;
}

// ---------------------------------------------------------------------
// Archivos privados (CV, documentos)
// ---------------------------------------------------------------------
/** URL temporal (1 hora) para ver un archivo privado. */
export async function urlFirmada(bucket, ruta) {
  return (await api(`/archivos/${bucket}/url`, { parametros: { ruta } })).url;
}

/** Sube un archivo a la carpeta indicada y devuelve la ruta guardada. */
export async function subirArchivo(bucket, carpeta, archivo) {
  const formulario = new FormData();
  formulario.append('carpeta', carpeta);
  formulario.append('archivo', archivo);
  return (await api(`/archivos/${bucket}`, { metodo: 'POST', formulario })).ruta;
}

export const eliminarArchivo = (bucket, ruta) => api(`/archivos/${bucket}`, { metodo: 'DELETE', parametros: { ruta } });

export const eliminarCarpeta = (bucket, carpeta) => api(`/archivos/${bucket}`, { metodo: 'DELETE', parametros: { carpeta } });
