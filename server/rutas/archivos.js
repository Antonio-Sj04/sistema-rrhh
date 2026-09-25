// /api/v1/archivos/{bucket} — subir, descargar (URL firmada) y borrar
// archivos privados. Storage aplica sus propias políticas RLS con el token.
import { ErrorHttp, json } from '../http.js';
import { esUuid, sanearTexto } from '../sanear.js';
import { exigirSesion } from '../sesion.js';

const BUCKETS = ['cvs', 'documentos'];
const TIPOS = { 'application/pdf': '%PDF-', 'image/jpeg': '\xff\xd8\xff', 'image/png': '\x89PNG' };
const MAX_BYTES = 5 * 1024 * 1024; // límite de cuerpo de Netlify Functions ≈ 6 MB
const RUTA = /^[0-9a-f-]{36}(\/antecedentes)?\/[\w.-]{1,150}$/i;
const CARPETA = /^[0-9a-f-]{36}(\/antecedentes)?$/i;

function validarRuta(ruta) {
  if (!RUTA.test(ruta ?? '') || ruta.includes('..')) throw new ErrorHttp(400, 'RUTA', 'Ruta de archivo inválida.');
  return ruta;
}

/** Confirma que el contenido corresponde al tipo declarado (no solo la extensión). */
export function tipoReal(bytes) {
  const inicio = String.fromCharCode(...bytes.slice(0, 5));
  return Object.entries(TIPOS).find(([, firma]) => inicio.startsWith(firma))?.[0] ?? null;
}

export async function manejarArchivos(request, url, bucket, accion) {
  if (!BUCKETS.includes(bucket)) throw new ErrorHttp(404, 'BUCKET', 'Carpeta de archivos inexistente.');
  const sesion = await exigirSesion(request);
  const storage = sesion.db.storage.from(bucket);

  // GET /archivos/{bucket}/url?ruta=... → URL firmada válida 1 hora
  if (request.method === 'GET' && accion === 'url') {
    const { data, error } = await storage.createSignedUrl(validarRuta(url.searchParams.get('ruta')), 3600);
    if (error) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'Archivo no encontrado o sin permiso.');
    return json({ url: data.signedUrl }, 200, sesion.cookies);
  }

  // POST /archivos/{bucket}  multipart: carpeta, archivo → { ruta }
  if (request.method === 'POST' && !accion) {
    const form = await request.formData().catch(() => {
      throw new ErrorHttp(400, 'FORMULARIO', 'Se esperaba multipart/form-data.');
    });
    const carpeta = String(form.get('carpeta') ?? '');
    const archivo = form.get('archivo');
    if (!CARPETA.test(carpeta) || !esUuid(carpeta.slice(0, 36))) throw new ErrorHttp(400, 'CARPETA', 'Carpeta inválida.');
    if (!(archivo instanceof File) || !archivo.size) throw new ErrorHttp(400, 'ARCHIVO', 'Adjunta un archivo.');
    if (archivo.size > MAX_BYTES) throw new ErrorHttp(413, 'ARCHIVO_GRANDE', 'El archivo no debe pasar de 5 MB.');
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const tipo = tipoReal(bytes);
    if (!tipo) throw new ErrorHttp(400, 'TIPO_ARCHIVO', 'Solo se permiten archivos PDF, JPG o PNG.');

    const nombre = sanearTexto(archivo.name).normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-120) || 'archivo';
    const ruta = `${carpeta}/${Date.now()}_${nombre}`;
    const { error } = await storage.upload(ruta, bytes, { contentType: tipo, upsert: false });
    if (error) throw new ErrorHttp(/row-level|policy|unauthorized/i.test(error.message) ? 403 : 400, 'SUBIDA', 'No se pudo guardar el archivo.');
    return json({ ruta }, 201, sesion.cookies);
  }

  // DELETE /archivos/{bucket}?ruta=...     borra un archivo
  // DELETE /archivos/{bucket}?carpeta=...  borra todos los archivos de una carpeta
  if (request.method === 'DELETE' && !accion) {
    let rutas = [];
    const carpeta = url.searchParams.get('carpeta');
    if (carpeta) {
      if (!CARPETA.test(carpeta)) throw new ErrorHttp(400, 'CARPETA', 'Carpeta inválida.');
      for (const sub of [carpeta, `${carpeta}/antecedentes`]) {
        const { data } = await storage.list(sub, { limit: 1000 });
        rutas.push(...(data ?? []).filter((a) => a.id).map((a) => `${sub}/${a.name}`));
      }
    } else {
      rutas = [validarRuta(url.searchParams.get('ruta'))];
    }
    if (rutas.length) {
      const { error } = await storage.remove(rutas);
      if (error) throw new ErrorHttp(403, 'BORRAR', 'No se pudo eliminar el archivo.');
    }
    return json({ ok: true, eliminados: rutas.length }, 200, sesion.cookies);
  }

  throw new ErrorHttp(405, 'METODO', 'Método no permitido en /archivos.');
}
