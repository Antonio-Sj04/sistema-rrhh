// Edge Function: elimina la cuenta de acceso de un usuario (solo admin).
// El expediente del empleado vinculado NO se borra; solo se pierde el acceso.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { data: { user } } = await cliente.auth.getUser();
  const { data: esAdmin } = await cliente.rpc('tiene_rol', { roles: ['admin'] });
  if (!user || !esAdmin) return respuesta({ error: 'No autorizado' }, 403);

  const { id } = await req.json().catch(() => ({}));
  if (!UUID.test(id ?? '')) return respuesta({ error: 'Usuario inválido' }, 400);
  if (id === user.id) return respuesta({ error: 'No puedes eliminar tu propio usuario.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: perfil } = await admin.from('perfiles').select('*').eq('id', id).maybeSingle();
  if (!perfil) return respuesta({ error: 'El usuario no existe.' }, 404);

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return respuesta({ error: error.message }, 400);

  // Queda constancia en la bitácora de quién eliminó a quién
  await admin.schema('empresa').from('auditoria').insert({
    esquema: 'auth',
    tabla: 'usuarios',
    operacion: 'DELETE',
    registro_id: id,
    antes: perfil,
    usuario_id: user.id,
  });

  return respuesta({ ok: true });
});
