import { tieneRol } from '../auth.js';
import { cargarCatalogos } from '../catalogos.js';
import { navegar } from '../router.js';
import { ok, reclutamiento } from '../supabase.js';
import { abrirFormulario, badge, esc, fecha, hoy, moneda, mostrarError, opciones, porId, tabla, toast } from '../ui.js';

export async function render(el) {
  const puedeEditar = tieneRol('admin', 'rrhh');
  const [catalogos, vacantes] = await Promise.all([
    cargarCatalogos(),
    ok(reclutamiento('vacantes').select('*, postulaciones(etapa)').order('fecha_apertura', { ascending: false })),
  ]);
  const deptos = porId(catalogos.departamentos);

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Vacantes</h1><p>Plazas abiertas y su avance en el proceso de selección.</p></div>
      <div class="acciones">
        <a class="boton" href="#/empleos" target="_blank" rel="noopener">Ver portal público ↗</a>
        ${puedeEditar ? '<button type="button" class="primario" id="nueva">+ Nueva vacante</button>' : ''}
      </div>
    </div>
    <div class="tarjeta" id="lista">${tabla(
      [
        { titulo: 'Vacante', render: (v) => `<strong>${esc(v.titulo)}</strong>` },
        { titulo: 'Departamento', render: (v) => esc(deptos[v.departamento_id]?.nombre ?? '—') },
        { titulo: 'Plazas', campo: 'plazas', clase: 'numero' },
        { titulo: 'Salario', render: (v) => (v.salario_ofrecido ? moneda(v.salario_ofrecido) : '—'), clase: 'numero' },
        { titulo: 'Candidatos', render: (v) => v.postulaciones.length, clase: 'numero' },
        { titulo: 'En proceso', render: (v) => v.postulaciones.filter((p) => !['contratado', 'rechazado'].includes(p.etapa)).length, clase: 'numero' },
        { titulo: 'Apertura', render: (v) => fecha(v.fecha_apertura) },
        { titulo: 'Estado', render: (v) => badge(v.estado) },
        { titulo: 'Portal', render: (v) => (v.publicar ? badge('info', 'Publicada') : badge('neutro', 'Interna')) },
        {
          titulo: '',
          clase: 'derecha',
          render: (v) => `<div class="acciones" style="justify-content:flex-end">
            ${v.publicar && v.estado === 'abierta' ? `<button type="button" class="pequeno" data-enlace="${v.id}">Copiar enlace</button>` : ''}
            <button type="button" class="pequeno" data-proceso="${v.id}">Ver proceso</button>
            ${puedeEditar ? `<button type="button" class="pequeno" data-editar="${v.id}">Editar</button>` : ''}</div>`,
        },
      ],
      vacantes,
      { vacio: 'No hay vacantes registradas.' },
    )}</div>`;

  const campos = [
    { nombre: 'titulo', etiqueta: 'Título de la vacante', requerido: true, completo: true },
    { nombre: 'departamento_id', etiqueta: 'Departamento', tipo: 'select', opciones: opciones(catalogos.departamentos) },
    { nombre: 'puesto_id', etiqueta: 'Puesto', tipo: 'select', opciones: opciones(catalogos.puestos) },
    { nombre: 'plazas', etiqueta: 'Número de plazas', tipo: 'number', min: 1, requerido: true },
    { nombre: 'salario_ofrecido', etiqueta: 'Salario ofrecido (Q)', tipo: 'number', paso: '0.01', min: 0 },
    { nombre: 'fecha_apertura', etiqueta: 'Fecha de apertura', tipo: 'date', requerido: true },
    { nombre: 'fecha_cierre', etiqueta: 'Fecha de cierre', tipo: 'date' },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: [['abierta', 'Abierta'], ['pausada', 'Pausada'], ['cerrada', 'Cerrada']] },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
    { nombre: 'requisitos', etiqueta: 'Requisitos', tipo: 'textarea' },
    { nombre: 'publicar', etiqueta: 'Publicar en el portal de empleo (visible para cualquier persona)', tipo: 'checkbox', completo: true },
    { nombre: 'publicar_salario', etiqueta: 'Mostrar el salario en el portal', tipo: 'checkbox', completo: true },
  ];

  const editar = (vacante) =>
    abrirFormulario({
      titulo: vacante ? 'Editar vacante' : 'Nueva vacante',
      campos,
      valores: vacante ?? { plazas: 1, fecha_apertura: hoy(), estado: 'abierta', publicar: true },
      alGuardar: async (datos) => {
        await ok(vacante ? reclutamiento('vacantes').update(datos).eq('id', vacante.id) : reclutamiento('vacantes').insert(datos));
        toast('Vacante guardada.');
        render(el).catch(mostrarError);
      },
    });

  el.querySelector('#nueva')?.addEventListener('click', () => editar());
  el.querySelector('#lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar], [data-proceso], [data-enlace]');
    if (b?.dataset.enlace) {
      const enlace = `${location.origin}${location.pathname}#/empleos?vacante=${b.dataset.enlace}`;
      navigator.clipboard.writeText(enlace).then(
        () => toast('Enlace copiado. Compártelo en redes sociales o bolsas de empleo.'),
        () => toast(enlace),
      );
    }
    if (b?.dataset.editar) editar(vacantes.find((v) => v.id === b.dataset.editar));
    if (b?.dataset.proceso) navegar(`/proceso?vacante=${b.dataset.proceso}`);
  });
}
