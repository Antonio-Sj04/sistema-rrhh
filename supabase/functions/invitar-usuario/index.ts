// Edge Function: invita un nuevo usuario por correo y le asigna rol.
// Solo los administradores pueden invocarla. Usa la service role key,
// que nunca debe exponerse en el navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLES = ['admin', 'rrhh', 'nomina', 'jefe', 'empleado'];

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const cliente = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: esAdmin, error: errRol } = await cliente.rpc('tiene_rol', { roles: ['admin'] });
  if (errRol || !esAdmin) return respuesta({ error: 'No autorizado' }, 403);

  const { email, nombre, rol, empleado_id, redirectTo } = await req.json();
  if (!email || !ROLES.includes(rol)) return respuesta({ error: 'Datos inválidos' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nombre },
    redirectTo,
  });
  if (error) return respuesta({ error: error.message }, 400);

  const { error: errPerfil } = await admin
    .from('perfiles')
    .update({ rol, empleado_id: empleado_id || null, nombre })
    .eq('id', data.user.id);
  if (errPerfil) return respuesta({ error: errPerfil.message }, 400);

  return respuesta({ id: data.user.id });
});
