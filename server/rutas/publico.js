// /api/v1/publico/* — portal de empleo, sin sesión.
// Lectura con funciones de solo lectura; la postulación valida todo aquí y
// escribe con service_role (solo en el servidor).
import { createHash } from 'node:crypto';
import { ErrorHttp, json } from '../http.js';
import { CORREO, esUuid, sanearTexto } from '../sanear.js';
import { clienteAnonimo, clienteServicio, config } from '../supabase.js';

const MAX_CV = 5 * 1024 * 1024;
const ENVIOS_POR_HORA = 5;
const TIEMPO_MINIMO_MS = 3000;
const NIVELES = ['primaria', 'basicos', 'diversificado', 'tecnico', 'licenciatura', 'maestria', 'doctorado'];

function numero(valor, max) {
  if (!valor) return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Revisa los números ingresados.');
  return n;
}

export async function manejarPublico(request, accion, ip) {
  if (accion === 'vacantes' && request.method === 'GET') {
    const { data, error } = await clienteAnonimo().rpc('vacantes_publicas');
    if (error) throw new ErrorHttp(500, 'BASE_DATOS', 'No se pudieron cargar las vacantes.');
    return json({ datos: data });
  }

  if (accion === 'empresa' && request.method === 'GET') {
    const { data } = await clienteAnonimo().rpc('empresa_publica');
    return json({ datos: data?.[0] ?? null });
  }

  if (accion === 'postulaciones' && request.method === 'POST') {
    const form = await request.formData().catch(() => {
      throw new ErrorHttp(400, 'FORMULARIO', 'Formulario inválido.');
    });
    const texto = (campo, max = 120) => sanearTexto(String(form.get(campo) ?? '')).slice(0, max);

    // Trampas para bots: campo oculto relleno o envío instantáneo
    if (texto('sitio_web')) return json({ ok: true }, 201);
    if (Number(form.get('t')) < TIEMPO_MINIMO_MS) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Revisa tus datos e inténtalo de nuevo.');

    const vacanteId = texto('vacante_id', 36);
    const datos = {
      nombres: texto('nombres', 80),
      apellidos: texto('apellidos', 80),
      email: texto('email', 120).toLowerCase(),
      telefono: texto('telefono', 30),
      dpi: texto('dpi', 13) || null,
      profesion: texto('profesion', 120) || null,
      nivel_academico: texto('nivel_academico', 20) || null,
      anios_experiencia: numero(texto('anios_experiencia', 5), 60),
      pretension_salarial: numero(texto('pretension_salarial', 12), 1_000_000),
    };
    if (!esUuid(vacanteId)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Vacante inválida.');
    if (!datos.nombres || !datos.apellidos) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe tus nombres y apellidos.');
    if (!CORREO.test(datos.email)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe un correo válido.');
    if (!/^[\d\s+()-]{8,30}$/.test(datos.telefono)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe un teléfono válido.');
    if (datos.dpi && !/^\d{13}$/.test(datos.dpi)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'El DPI debe tener 13 dígitos.');
    if (datos.nivel_academico && !NIVELES.includes(datos.nivel_academico)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Nivel académico inválido.');
    if (form.get('consentimiento') !== 'true') throw new ErrorHttp(400, 'CONSENTIMIENTO', 'Debes aceptar el tratamiento de tus datos personales.');

    const cv = form.get('cv');
    if (!(cv instanceof File) || !cv.size) throw new ErrorHttp(400, 'CV', 'Adjunta tu CV en PDF.');
    if (cv.size > MAX_CV) throw new ErrorHttp(413, 'CV', 'El CV no debe pasar de 5 MB.');
    const contenido = new Uint8Array(await cv.arrayBuffer());
    if (String.fromCharCode(...contenido.slice(0, 5)) !== '%PDF-') throw new ErrorHttp(400, 'CV', 'El CV debe ser un archivo PDF.');

    const admin = clienteServicio();
    const rec = admin.schema('reclutamiento');

    // Límite de envíos por IP (solo se guarda un hash, nunca la IP)
    const ipHash = createHash('sha256').update(`${ip || 'desconocida'}|${config.url}`).digest('hex');
    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await rec.from('envios_portal').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', haceUnaHora);
    if ((count ?? 0) >= ENVIOS_POR_HORA) throw new ErrorHttp(429, 'LIMITE', 'Has enviado muchas postulaciones. Inténtalo más tarde.');
    await rec.from('envios_portal').insert({ ip_hash: ipHash });
    await rec.from('envios_portal').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());

    const { data: vacante } = await rec.from('vacantes').select('id, estado, publicar').eq('id', vacanteId).maybeSingle();
    if (!vacante || vacante.estado !== 'abierta' || !vacante.publicar) throw new ErrorHttp(404, 'VACANTE', 'Esta vacante ya no está disponible.');

    // Reutiliza al postulante si ya existe (por DPI o correo) sin modificar sus datos
    let postulanteId = null;
    let esNuevo = false;
    if (datos.dpi) postulanteId = (await rec.from('postulantes').select('id').eq('dpi', datos.dpi).maybeSingle()).data?.id ?? null;
    if (!postulanteId) {
      const correoExacto = datos.email.replace(/[\\%_]/g, (c) => `\\${c}`);
      postulanteId = (await rec.from('postulantes').select('id').ilike('email', correoExacto).limit(1).maybeSingle()).data?.id ?? null;
    }
    if (postulanteId) {
      const { data: previa } = await rec.from('postulaciones').select('id').eq('postulante_id', postulanteId).eq('vacante_id', vacanteId).maybeSingle();
      if (previa) return json({ ok: true, repetida: true }, 200);
    } else {
      const { data, error } = await rec.from('postulantes')
        .insert({ ...datos, fuente: 'portal_empleo', consentimiento_datos: true, fecha_consentimiento: new Date().toISOString().slice(0, 10) })
        .select('id').single();
      if (error) throw new ErrorHttp(500, 'BASE_DATOS', 'No se pudo registrar tu postulación. Inténtalo de nuevo.');
      postulanteId = data.id;
      esNuevo = true;
    }

    const ruta = `${postulanteId}/portal_${Date.now()}.pdf`;
    const { error: errCv } = await admin.storage.from('cvs').upload(ruta, contenido, { contentType: 'application/pdf' });
    if (errCv) {
      if (esNuevo) await rec.from('postulantes').delete().eq('id', postulanteId);
      throw new ErrorHttp(500, 'CV', 'No se pudo guardar tu CV. Inténtalo de nuevo.');
    }
    if (esNuevo) await rec.from('postulantes').update({ cv_ruta: ruta }).eq('id', postulanteId);
    const { error: errPost } = await rec.from('postulaciones').insert({ postulante_id: postulanteId, vacante_id: vacanteId, cv_ruta: ruta });
    if (errPost) throw new ErrorHttp(500, 'BASE_DATOS', 'No se pudo registrar tu postulación. Inténtalo de nuevo.');
    return json({ ok: true }, 201);
  }

  throw new ErrorHttp(404, 'RUTA', 'Ruta pública no encontrada.');
}
