// /api/v1/usuarios — alta (invitación) y baja de cuentas de acceso.
// Requieren rol admin y usan la clave service_role solo en el servidor.
import { ErrorHttp, errorDeBaseDatos, json, leerJson } from '../http.js';
import { CORREO, esUuid, sanearTexto } from '../sanear.js';
import { exigirRol, exigirSesion, usuarioVerificado } from '../sesion.js';
import { clienteServicio } from '../supabase.js';

const ROLES = ['admin', 'rrhh', 'nomina', 'jefe', 'empleado'];

export async function manejarUsuarios(request, id) {
  const sesion = await exigirSesion(request);
  await exigirRol(sesion, 'admin');
  const admin = clienteServicio();

  // POST /usuarios  { email, nombre, rol, empleado_id } — envía la invitación por correo
  if (request.method === 'POST' && !id) {
    const cuerpo = await leerJson(request);
    const email = sanearTexto(cuerpo.email ?? '').toLowerCase();
    const nombre = sanearTexto(cuerpo.nombre ?? '');
    const empleadoId = cuerpo.empleado_id || null;
    if (!CORREO.test(email)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe un correo válido.');
    if (!nombre) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Escribe el nombre.');
    if (!ROLES.includes(cuerpo.rol)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Rol inválido.');
    if (empleadoId && !esUuid(empleadoId)) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Empleado inválido.');

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nombre },
      redirectTo: new URL('/', request.url).href,
    });
    if (error) {
      throw new ErrorHttp(/already been registered|exists/i.test(error.message) ? 409 : 400, 'INVITACION',
        /already been registered|exists/i.test(error.message) ? 'Ya existe un usuario con ese correo.' : error.message);
    }
    const { error: errPerfil } = await admin.from('perfiles').update({ rol: cuerpo.rol, empleado_id: empleadoId, nombre }).eq('id', data.user.id);
    if (errPerfil) throw errorDeBaseDatos(errPerfil);
    return json({ datos: { id: data.user.id, email } }, 201, sesion.cookies);
  }

  // DELETE /usuarios/{id} — elimina la cuenta; el expediente del empleado se conserva
  if (request.method === 'DELETE' && id) {
    if (!esUuid(id)) throw new ErrorHttp(400, 'ID', 'Identificador inválido.');
    const yo = await usuarioVerificado(sesion);
    if (id === yo.id) throw new ErrorHttp(400, 'PROPIO', 'No puedes eliminar tu propio usuario.');

    const { data: perfil } = await admin.from('perfiles').select('*').eq('id', id).maybeSingle();
    if (!perfil) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'El usuario no existe.');
    // La base de datos también lo impide (trigger proteger_superadmin); aquí solo se da un mensaje claro
    if (perfil.protegido) throw new ErrorHttp(403, 'PROTEGIDO', 'Este usuario es superadministrador y no se puede eliminar.');
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new ErrorHttp(400, 'ELIMINAR', error.message);

    await admin.schema('empresa').from('auditoria').insert({
      esquema: 'auth', tabla: 'usuarios', operacion: 'DELETE', registro_id: id, antes: perfil, usuario_id: yo.id,
    });
    return json({ ok: true }, 200, sesion.cookies);
  }

  throw new ErrorHttp(405, 'METODO', 'Método no permitido en /usuarios.');
}
