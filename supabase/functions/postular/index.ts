// Edge Function pública: recibe postulaciones del portal de empleo.
// No requiere sesión; toda la validación ocurre aquí y la escritura usa la
// service role key, que nunca llega al navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_CV = 5 * 1024 * 1024;
const ENVIOS_POR_HORA = 5;
const TIEMPO_MINIMO_MS = 3000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NIVELES = ['primaria', 'basicos', 'diversificado', 'tecnico', 'licenciatura', 'maestria', 'doctorado'];

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const error = (mensaje: string, status = 400) => respuesta({ error: mensaje }, status);

async function sha256(texto: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function numero(valor: string, max: number) {
  if (!valor) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return error('Método no permitido', 405);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error('Formulario inválido');
  }
  const texto = (campo: string, max = 120) => String(form.get(campo) ?? '').trim().slice(0, max);

  // Trampas para bots: campo oculto relleno o envío instantáneo
  if (texto('sitio_web')) return respuesta({ ok: true });
  if (Number(form.get('t')) < TIEMPO_MINIMO_MS) return error('Revisa tus datos e inténtalo de nuevo.');

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

  if (!UUID.test(vacanteId)) return error('Vacante inválida.');
  if (!datos.nombres || !datos.apellidos) return error('Escribe tus nombres y apellidos.');
  if (!CORREO.test(datos.email)) return error('Escribe un correo válido.');
  if (!/^[\d\s+()-]{8,30}$/.test(datos.telefono)) return error('Escribe un teléfono válido.');
  if (datos.dpi && !/^\d{13}$/.test(datos.dpi)) return error('El DPI debe tener 13 dígitos.');
  if (datos.nivel_academico && !NIVELES.includes(datos.nivel_academico)) return error('Nivel académico inválido.');
  if (Number.isNaN(datos.anios_experiencia) || Number.isNaN(datos.pretension_salarial)) return error('Revisa los números ingresados.');
  if (form.get('consentimiento') !== 'true') return error('Debes aceptar el tratamiento de tus datos personales.');

  const cv = form.get('cv');
  if (!(cv instanceof File) || cv.size === 0) return error('Adjunta tu CV en PDF.');
  if (cv.size > MAX_CV) return error('El CV no debe pasar de 5 MB.');
  const contenido = new Uint8Array(await cv.arrayBuffer());
  // Un PDF real empieza con "%PDF-"
  if (new TextDecoder().decode(contenido.slice(0, 5)) !== '%PDF-') return error('El CV debe ser un archivo PDF.');

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const rec = admin.schema('reclutamiento');

  // Límite de envíos por IP (se guarda solo un hash, nunca la IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconocida';
  const ipHash = await sha256(`${ip}|${url}`);
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await rec.from('envios_portal').select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).gte('created_at', haceUnaHora);
  if ((count ?? 0) >= ENVIOS_POR_HORA) return error('Has enviado muchas postulaciones. Inténtalo más tarde.', 429);
  await rec.from('envios_portal').insert({ ip_hash: ipHash });
  await rec.from('envios_portal').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());

  const { data: vacante } = await rec.from('vacantes').select('id, estado, publicar').eq('id', vacanteId).maybeSingle();
  if (!vacante || vacante.estado !== 'abierta' || !vacante.publicar) return error('Esta vacante ya no está disponible.');

  // Reutiliza al postulante si ya existe (por DPI o correo) sin modificar sus datos
  let postulanteId: string | null = null;
  let esNuevo = false;
  if (datos.dpi) {
    const { data } = await rec.from('postulantes').select('id').eq('dpi', datos.dpi).maybeSingle();
    postulanteId = data?.id ?? null;
  }
  if (!postulanteId) {
    // Se escapan % y _ para que el correo no funcione como comodín
    const correoExacto = datos.email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data } = await rec.from('postulantes').select('id').ilike('email', correoExacto).limit(1).maybeSingle();
    postulanteId = data?.id ?? null;
  }
  if (postulanteId) {
    const { data: previa } = await rec.from('postulaciones').select('id')
      .eq('postulante_id', postulanteId).eq('vacante_id', vacanteId).maybeSingle();
    if (previa) return respuesta({ ok: true, repetida: true });
  } else {
    const { data, error: errNuevo } = await rec.from('postulantes').insert({
      ...datos,
      fuente: 'portal_empleo',
      consentimiento_datos: true,
      fecha_consentimiento: new Date().toISOString().slice(0, 10),
    }).select('id').single();
    if (errNuevo) {
      console.error(errNuevo);
      return error('No se pudo registrar tu postulación. Inténtalo de nuevo.', 500);
    }
    postulanteId = data.id;
    esNuevo = true;
  }

  const ruta = `${postulanteId}/portal_${Date.now()}.pdf`;
  const { error: errCv } = await admin.storage.from('cvs').upload(ruta, contenido, { contentType: 'application/pdf' });
  if (errCv) {
    console.error(errCv);
    if (esNuevo) await rec.from('postulantes').delete().eq('id', postulanteId);
    return error('No se pudo guardar tu CV. Inténtalo de nuevo.', 500);
  }
  if (esNuevo) await rec.from('postulantes').update({ cv_ruta: ruta }).eq('id', postulanteId);

  const { error: errPost } = await rec.from('postulaciones').insert({ postulante_id: postulanteId, vacante_id: vacanteId, cv_ruta: ruta });
  if (errPost) {
    console.error(errPost);
    return error('No se pudo registrar tu postulación. Inténtalo de nuevo.', 500);
  }
  return respuesta({ ok: true });
});
