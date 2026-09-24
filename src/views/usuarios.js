import { obtenerPerfil, urlRecuperacion } from '../auth.js';
import { empresa, ok, supabase } from '../supabase.js';
import { abrirFormulario, badge, confirmar, esc, etiqueta, fecha, mostrarError, nombreCompleto, opciones, porId, tabla, toast } from '../ui.js';

const ROLES = [
  ['admin', 'Administrador — acceso total'],
  ['rrhh', 'Recursos Humanos — personal y reclutamiento'],
  ['nomina', 'Nómina — planillas y pagos'],
  ['jefe', 'Jefe de área — su equipo y sus vacantes'],
  ['empleado', 'Empleado — solo su portal'],
];

export async function render(el) {
  const yo = obtenerPerfil();
  const [perfiles, empleados] = await Promise.all([
    ok(supabase.from('perfiles').select('*').order('created_at')),
    ok(empresa('empleados').select('id, nombres, apellidos, email').neq('estado', 'baja').order('apellidos')),
  ]);
  const emps = porId(empleados);

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Usuarios y roles</h1><p>Controla quién accede al sistema y qué puede ver.</p></div>
      <div class="acciones"><button type="button" class="primario" id="invitar">+ Invitar usuario</button></div>
    </div>
    <div class="tarjeta" id="lista">${tabla(
      [
        { titulo: 'Usuario', render: (p) => `<strong>${esc(p.nombre ?? '—')}</strong><div class="texto-suave">${esc(p.email)}</div>` },
        { titulo: 'Rol', render: (p) => esc(etiqueta(p.rol)) },
        { titulo: 'Empleado vinculado', render: (p) => esc(p.empleado_id ? nombreCompleto(emps[p.empleado_id]) : '—') },
        { titulo: 'Alta', render: (p) => fecha(p.created_at) },
        { titulo: 'Estado', render: (p) => (p.activo ? badge('activo') : badge('baja', 'Inactivo')) },
        {
          titulo: '',
          clase: 'derecha',
          render: (p) => `<div class="acciones" style="justify-content:flex-end">
            <button type="button" class="pequeno" data-editar="${p.id}">Editar</button>
            ${p.id === yo.id ? '' : `<button type="button" class="pequeno peligro" data-eliminar="${p.id}">Eliminar</button>`}</div>`,
        },
      ],
      perfiles,
    )}</div>`;

  const campoEmpleado = { nombre: 'empleado_id', etiqueta: 'Empleado vinculado', tipo: 'select', completo: true, opciones: opciones(empleados, nombreCompleto), ayuda: 'Permite al usuario ver su portal, recibos y solicitudes.' };

  el.querySelector('#lista').addEventListener('click', async (e) => {
    const borrar = e.target.closest('[data-eliminar]');
    if (borrar) {
      const perfil = perfiles.find((p) => p.id === borrar.dataset.eliminar);
      const vinculado = perfil.empleado_id ? ` Su expediente de empleado (${nombreCompleto(emps[perfil.empleado_id])}) se conserva.` : '';
      const mensaje = `Se eliminará la cuenta de ${perfil.email}: ya no podrá iniciar sesión y el correo quedará libre para invitarlo de nuevo.${vinculado} Esta acción no se puede deshacer. Si solo quieres bloquear el acceso temporalmente, usa "Editar" y desmarca "Usuario activo".`;
      if (!(await confirmar(mensaje, { textoAceptar: 'Eliminar usuario', peligro: true }))) return;
      try {
        const { error } = await supabase.functions.invoke('eliminar-usuario', { body: { id: perfil.id } });
        if (error) {
          const detalle = await error.context?.json?.().catch(() => null);
          throw new Error(detalle?.error ?? error.message);
        }
        toast(`Usuario ${perfil.email} eliminado.`);
        render(el).catch(mostrarError);
      } catch (error) {
        mostrarError(error);
      }
      return;
    }
    const b = e.target.closest('[data-editar]');
    if (!b) return;
    const perfil = perfiles.find((p) => p.id === b.dataset.editar);
    const esYo = perfil.id === yo.id;
    abrirFormulario({
      titulo: `Editar ${perfil.email}`,
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre visible', completo: true },
        { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', requerido: true, completo: true, opciones: ROLES },
        campoEmpleado,
        { nombre: 'activo', etiqueta: 'Usuario activo (puede iniciar sesión)', tipo: 'checkbox', completo: true },
      ],
      valores: perfil,
      alGuardar: async (datos) => {
        if (esYo && (datos.rol !== 'admin' || !datos.activo)) throw new Error('No puedes quitarte el rol de administrador ni desactivarte a ti mismo.');
        await ok(supabase.from('perfiles').update(datos).eq('id', perfil.id));
        toast('Usuario actualizado.');
        render(el).catch(mostrarError);
      },
    });
  });

  el.querySelector('#invitar').addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Invitar usuario',
      textoGuardar: 'Enviar invitación',
      campos: [
        { nombre: 'email', etiqueta: 'Correo', tipo: 'email', requerido: true },
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
        { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', requerido: true, completo: true, opciones: ROLES },
        campoEmpleado,
      ],
      valores: { rol: 'empleado' },
      extra: '<p class="texto-suave" style="margin-top:14px">El usuario recibirá un correo para crear su contraseña.</p>',
      alGuardar: async (datos) => {
        const { data, error } = await supabase.functions.invoke('invitar-usuario', {
          body: { ...datos, redirectTo: urlRecuperacion() },
        });
        if (error) {
          const detalle = await error.context?.json?.().catch(() => null);
          throw new Error(detalle?.error ?? error.message);
        }
        if (data?.error) throw new Error(data.error);
        toast('Invitación enviada.');
        render(el).catch(mostrarError);
      },
    }),
  );
}
