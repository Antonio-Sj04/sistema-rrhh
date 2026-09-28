// Autoservicio del empleado: sus datos, recibos y solicitudes de ausencia.
import { obtenerPerfil } from '../auth.js';
import { TIPOS_AUSENCIA } from '../catalogos.js';
import { TIPOS_CONSTANCIA, generarConstancia } from '../constancias.js';
import { sublista } from '../sublista.js';
import { empresa, ok } from '../api.js';
import { badge, colorAvatar, esc, estrellas, etiqueta, fecha, iniciales, moneda, montarPestanas, nombreCompleto } from '../ui.js';
import { mostrarRecibo } from './periodo.js';

export async function render(el) {
  const perfil = obtenerPerfil();
  if (!perfil.empleado_id) {
    el.innerHTML = `<div class="tarjeta"><div class="vacio"><h2>Tu usuario aún no está vinculado a un expediente</h2>
      <p>Solicita a Recursos Humanos que vincule tu usuario con tu registro de empleado.</p></div></div>`;
    return;
  }
  const id = perfil.empleado_id;
  const emp = await ok(empresa('empleados').select('*, puesto:puestos(nombre), departamento:departamentos(nombre)').eq('id', id).single());

  el.innerHTML = `
    <div class="encabezado">
      <div class="persona"><span class="avatar grande" style="${colorAvatar(nombreCompleto(emp))}">${esc(iniciales(emp))}</span>
        <div><h1>${esc(nombreCompleto(emp))}</h1>
        <p>${esc(emp.puesto?.nombre ?? '')} · ${esc(emp.departamento?.nombre ?? '')} · Desde ${fecha(emp.fecha_ingreso)}</p></div></div>
    </div>
    <div class="tarjeta" id="pestanas"></div>`;

  montarPestanas(el.querySelector('#pestanas'), [
    {
      id: 'solicitudes',
      titulo: 'Vacaciones y permisos',
      render: (p) =>
        sublista(p, {
          titulo: 'Mis solicitudes',
          textoNuevo: 'Nueva solicitud',
          puedeEditar: true,
          cargar: () => ok(empresa('ausencias').select('*').eq('empleado_id', id).order('fecha_inicio', { ascending: false })),
          columnas: [
            { titulo: 'Tipo', render: (a) => esc(etiqueta(a.tipo)) },
            { titulo: 'Desde', render: (a) => fecha(a.fecha_inicio) },
            { titulo: 'Hasta', render: (a) => fecha(a.fecha_fin) },
            { titulo: 'Días', campo: 'dias', clase: 'numero' },
            { titulo: 'Estado', render: (a) => badge(a.estado) },
          ],
          campos: [
            { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: TIPOS_AUSENCIA.filter(([v]) => v !== 'falta') },
            { nombre: 'dias', etiqueta: 'Días hábiles', tipo: 'number', paso: '0.5', min: 0.5, requerido: true },
            { nombre: 'fecha_inicio', etiqueta: 'Desde', tipo: 'date', requerido: true },
            { nombre: 'fecha_fin', etiqueta: 'Hasta', tipo: 'date', requerido: true },
            { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'textarea' },
          ],
          guardar: (datos) => ok(empresa('ausencias').insert({ ...datos, empleado_id: id, estado: 'pendiente' })),
        }),
    },
    {
      id: 'recibos',
      titulo: 'Mis recibos',
      render: (p) =>
        sublista(p, {
          titulo: 'Recibos de pago',
          cargar: () =>
            ok(
              empresa('recibos_nomina')
                .select('*, periodo:periodos_nomina(*), empleado:empleados(codigo, nombres, apellidos, dpi, afiliacion_igss, puesto:puestos(nombre))')
                .eq('empleado_id', id)
                .order('created_at', { ascending: false }),
            ),
          columnas: [
            { titulo: 'Período', render: (r) => esc(r.periodo.nombre) },
            { titulo: 'Fecha de pago', render: (r) => fecha(r.periodo.fecha_pago) },
            { titulo: 'Líquido', render: (r) => `<strong>${moneda(r.liquido)}</strong>`, clase: 'numero' },
            { titulo: '', clase: 'derecha', render: (r) => `<button type="button" class="pequeno" data-ver="${r.id}">Ver recibo</button>` },
          ],
          vacio: 'Aún no tienes recibos publicados.',
          alMontar: (panel, filas) =>
            panel.addEventListener('click', (e) => {
              const b = e.target.closest('[data-ver]');
              const r = b && filas.find((x) => x.id === b.dataset.ver);
              if (r) mostrarRecibo(r.periodo, r);
            }),
        }),
    },
    {
      id: 'constancias',
      titulo: 'Constancias',
      render: (p) =>
        sublista(p, {
          titulo: 'Mis constancias',
          textoNuevo: 'Nueva constancia',
          puedeEditar: true,
          cargar: () => ok(empresa('constancias').select('*').eq('empleado_id', id).order('created_at', { ascending: false })),
          columnas: [
            { titulo: 'Fecha', render: (c) => fecha(c.created_at, true) },
            { titulo: 'Tipo', render: (c) => esc(TIPOS_CONSTANCIA.find(([t]) => t === c.tipo)?.[1]) },
            { titulo: 'Dirigida a', render: (c) => esc(c.dirigida_a ?? 'A quien interese') },
            { titulo: 'Código', render: (c) => `<code>${esc(c.codigo)}</code>` },
          ],
          campos: [
            { nombre: 'tipo', etiqueta: 'Tipo de constancia', tipo: 'select', requerido: true, completo: true, opciones: TIPOS_CONSTANCIA },
            { nombre: 'dirigida_a', etiqueta: 'Dirigida a', completo: true, placeholder: 'A quien interese', ayuda: 'Ej.: Banco Industrial, Embajada de…' },
          ],
          valores: { tipo: 'laboral' },
          guardar: ({ tipo, dirigida_a }) => generarConstancia(emp, tipo, dirigida_a),
          vacio: 'Genera una constancia laboral o de ingresos; se descargará en PDF.',
        }),
    },
    {
      id: 'evaluaciones',
      titulo: 'Mis evaluaciones',
      render: (p) =>
        sublista(p, {
          titulo: 'Evaluaciones de desempeño',
          cargar: () => ok(empresa('evaluaciones').select('*').eq('empleado_id', id).order('fecha', { ascending: false })),
          columnas: [
            { titulo: 'Período', campo: 'periodo' },
            { titulo: 'Calificación', render: (e) => estrellas(e.calificacion) },
            { titulo: 'Fortalezas', campo: 'fortalezas' },
            { titulo: 'Áreas de mejora', campo: 'mejoras' },
          ],
        }),
    },
    {
      id: 'datos',
      titulo: 'Mis datos',
      render: (p) => {
        const d = (t, v) => `<div><dt>${esc(t)}</dt><dd>${esc(v ?? '—')}</dd></div>`;
        p.innerHTML = `<div class="tarjeta-cuerpo"><dl class="datos">
          ${d('Código', emp.codigo)}${d('DPI', emp.dpi)}${d('NIT', emp.nit)}${d('Afiliación IGSS', emp.afiliacion_igss)}
          ${d('Correo', emp.email)}${d('Teléfono', emp.telefono)}${d('Dirección', emp.direccion)}
          ${d('Banco', emp.banco)}${d('Cuenta', emp.cuenta_bancaria)}
        </dl><p class="texto-suave" style="margin-top:20px">¿Algún dato es incorrecto? Comunícate con Recursos Humanos.</p></div>`;
      },
    },
  ]);
}
