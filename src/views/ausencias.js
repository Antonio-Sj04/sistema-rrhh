import { obtenerSesion, tieneRol } from '../auth.js';
import { TIPOS_AUSENCIA } from '../catalogos.js';
import { empresa, ok } from '../api.js';
import { abrirFormulario, badge, esc, etiqueta, fecha, mostrarError, nombreCompleto, opciones, persona, tabla, toast } from '../ui.js';

export async function render(el) {
  const puedeAprobar = tieneRol('admin', 'rrhh', 'jefe');
  const puedeRegistrar = tieneRol('admin', 'rrhh');

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Vacaciones y permisos</h1><p>Solicitudes de ausencia del personal. En Guatemala corresponden 15 días hábiles de vacaciones por año.</p></div>
      <div class="acciones">${puedeRegistrar ? '<button type="button" class="primario" id="nueva">+ Registrar ausencia</button>' : ''}</div>
    </div>
    <div class="tarjeta">
      <div class="filtros">
        <select id="f-estado">
          <option value="pendiente">Pendientes</option><option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option><option value="">Todas</option></select>
        <select id="f-tipo"><option value="">Todos los tipos</option>
          ${TIPOS_AUSENCIA.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>
      </div>
      <div id="lista"></div>
    </div>`;

  const lista = el.querySelector('#lista');
  const fEstado = el.querySelector('#f-estado');
  const fTipo = el.querySelector('#f-tipo');

  async function cargar() {
    let q = empresa('ausencias')
      .select('*, empleado:empleados(nombres, apellidos, codigo)')
      .order('fecha_inicio', { ascending: false })
      .limit(300);
    if (fEstado.value) q = q.eq('estado', fEstado.value);
    if (fTipo.value) q = q.eq('tipo', fTipo.value);
    const filas = await ok(q);
    lista.innerHTML = tabla(
      [
        { titulo: 'Empleado', render: (a) => persona(a.empleado, a.empleado?.codigo) },
        { titulo: 'Tipo', render: (a) => esc(etiqueta(a.tipo)) },
        { titulo: 'Desde', render: (a) => fecha(a.fecha_inicio) },
        { titulo: 'Hasta', render: (a) => fecha(a.fecha_fin) },
        { titulo: 'Días', campo: 'dias', clase: 'numero' },
        { titulo: 'Motivo', campo: 'motivo' },
        { titulo: 'Estado', render: (a) => badge(a.estado) },
        {
          titulo: '',
          clase: 'derecha',
          render: (a) =>
            puedeAprobar && a.estado === 'pendiente'
              ? `<div class="acciones" style="justify-content:flex-end">
                  <button type="button" class="pequeno boton-exito" data-aprobar="${a.id}">Aprobar</button>
                  <button type="button" class="pequeno peligro" data-rechazar="${a.id}">Rechazar</button></div>`
              : '',
        },
      ],
      filas,
      { vacio: 'No hay solicitudes con estos filtros.' },
    );
  }

  lista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-aprobar], [data-rechazar]');
    if (!b) return;
    const estado = b.dataset.aprobar ? 'aprobada' : 'rechazada';
    try {
      await ok(empresa('ausencias').update({ estado, aprobado_por: obtenerSesion().user.id }).eq('id', b.dataset.aprobar ?? b.dataset.rechazar));
      toast(`Solicitud ${estado}.`);
      cargar();
    } catch (error) {
      mostrarError(error);
    }
  });

  el.querySelector('#nueva')?.addEventListener('click', async () => {
    const empleados = await ok(empresa('empleados').select('id, nombres, apellidos').eq('estado', 'activo').order('apellidos'));
    abrirFormulario({
      titulo: 'Registrar ausencia',
      campos: [
        { nombre: 'empleado_id', etiqueta: 'Empleado', tipo: 'select', requerido: true, completo: true, opciones: opciones(empleados, nombreCompleto) },
        { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: TIPOS_AUSENCIA },
        { nombre: 'dias', etiqueta: 'Días', tipo: 'number', paso: '0.5', min: 0.5, requerido: true },
        { nombre: 'fecha_inicio', etiqueta: 'Desde', tipo: 'date', requerido: true },
        { nombre: 'fecha_fin', etiqueta: 'Hasta', tipo: 'date', requerido: true },
        { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'textarea' },
      ],
      alGuardar: async (datos) => {
        await ok(empresa('ausencias').insert({ ...datos, estado: 'aprobada', aprobado_por: obtenerSesion().user.id }));
        toast('Ausencia registrada.');
        cargar();
      },
    });
  });

  fEstado.addEventListener('change', cargar);
  fTipo.addEventListener('change', cargar);
  await cargar();
}
