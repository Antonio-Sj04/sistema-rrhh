// Tablero Kanban del proceso de selección por vacante.
import { tieneRol } from '../auth.js';
import { ETAPAS, cargarCatalogos } from '../catalogos.js';
import { navegar } from '../router.js';
import { api, ok, reclutamiento } from '../api.js';
import {
  abrirFormulario, badge, esc, estrellas, etiqueta, fecha, hoy, moneda, mostrarError, nombreCompleto, opciones, tabla, toast,
} from '../ui.js';

export async function render(el) {
  const puedeEditar = tieneRol('admin', 'rrhh');
  const vacantes = await ok(reclutamiento('vacantes').select('*').neq('estado', 'cerrada').order('titulo'));
  if (!vacantes.length) {
    el.innerHTML = `<div class="encabezado"><div><h1>Proceso de selección</h1></div></div>
      <div class="tarjeta"><div class="vacio">No hay vacantes abiertas. <a href="/vacantes">Crea una vacante</a> para comenzar.</div></div>`;
    return;
  }

  const solicitada = new URLSearchParams(location.search).get('vacante');
  let vacanteId = vacantes.some((v) => v.id === solicitada) ? solicitada : vacantes[0].id;

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Proceso de selección</h1><p>${puedeEditar ? 'Arrastra a los candidatos entre etapas o usa el selector de cada tarjeta.' : 'Avance de los candidatos por etapa.'}</p></div>
      <div class="acciones">
        <select id="vacante">${vacantes.map((v) => `<option value="${v.id}" ${v.id === vacanteId ? 'selected' : ''}>${esc(v.titulo)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="kanban" id="kanban"></div>
    <div class="tarjeta" style="margin-top:16px" id="entrevistas"></div>`;

  const kanban = el.querySelector('#kanban');
  const panelEntrevistas = el.querySelector('#entrevistas');
  let postulaciones = [];

  async function cargar() {
    postulaciones = await ok(
      reclutamiento('postulaciones')
        .select('*, postulante:postulantes(id, nombres, apellidos, profesion, pretension_salarial, anios_experiencia), entrevistas(*)')
        .eq('vacante_id', vacanteId)
        .order('created_at'),
    );
    pintar();
  }

  function ficha(po) {
    const p = po.postulante;
    const selector = puedeEditar
      ? `<select class="pequeno" data-mover="${po.id}" aria-label="Mover a etapa">
          ${ETAPAS.map(([v, t]) => `<option value="${v}" ${v === po.etapa ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : '';
    return `<div class="ficha" draggable="${puedeEditar}" data-id="${po.id}">
      <div class="ficha-nombre"><a href="/postulantes/${p.id}">${esc(nombreCompleto(p))}</a></div>
      <div class="ficha-meta">${esc(p.profesion ?? '')}${p.anios_experiencia != null ? ` · ${p.anios_experiencia} años` : ''}</div>
      ${p.pretension_salarial ? `<div class="ficha-meta">Pretensión: ${moneda(p.pretension_salarial)}</div>` : ''}
      ${po.calificacion ? `<div>${estrellas(po.calificacion)}</div>` : ''}
      ${po.motivo_rechazo ? `<div class="ficha-meta">Motivo: ${esc(po.motivo_rechazo)}</div>` : ''}
      ${puedeEditar ? `<div class="ficha-acciones">${selector}
        ${!['contratado', 'rechazado'].includes(po.etapa) ? `<button type="button" class="pequeno" data-entrevista="${po.id}">Entrevista</button>
          <button type="button" class="pequeno" data-calificar="${po.id}">Calificar</button>` : ''}
        ${po.etapa === 'oferta' ? `<button type="button" class="pequeno boton-exito" data-contratar="${po.id}">Contratar</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  function pintar() {
    kanban.innerHTML = ETAPAS.map(([etapa, titulo]) => {
      const items = postulaciones.filter((po) => po.etapa === etapa);
      return `<section class="columna" data-etapa="${etapa}">
        <div class="columna-titulo"><span>${esc(titulo)}</span><span class="badge">${items.length}</span></div>
        <div class="columna-lista">${items.map(ficha).join('')}</div>
      </section>`;
    }).join('');

    const entrevistas = postulaciones
      .flatMap((po) => po.entrevistas.map((e) => ({ ...e, postulante: po.postulante })))
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    panelEntrevistas.innerHTML = `<div class="tarjeta-titulo"><h2>Entrevistas</h2></div>${tabla(
      [
        { titulo: 'Candidato', render: (e) => esc(nombreCompleto(e.postulante)) },
        { titulo: 'Fecha y hora', render: (e) => fecha(e.fecha_hora, true) },
        { titulo: 'Tipo', render: (e) => esc(etiqueta(e.tipo)) },
        { titulo: 'Estado', render: (e) => badge(e.estado) },
        { titulo: 'Calificación', render: (e) => estrellas(e.calificacion) },
        { titulo: 'Comentarios', campo: 'comentarios' },
        {
          titulo: '',
          clase: 'derecha',
          render: (e) => (puedeEditar && e.estado === 'programada' ? `<button type="button" class="pequeno" data-resultado="${e.id}">Registrar resultado</button>` : ''),
        },
      ],
      entrevistas,
      { vacio: 'No hay entrevistas agendadas para esta vacante.' },
    )}`;
  }

  async function moverA(po, etapa) {
    if (etapa === po.etapa) return;
    if (etapa === 'contratado') return contratar(po);
    if (etapa === 'rechazado') {
      return abrirFormulario({
        titulo: `Rechazar a ${nombreCompleto(po.postulante)}`,
        textoGuardar: 'Rechazar',
        campos: [{ nombre: 'motivo_rechazo', etiqueta: 'Motivo del rechazo', tipo: 'textarea', requerido: true }],
        alGuardar: async (datos) => {
          await ok(reclutamiento('postulaciones').update({ etapa, ...datos }).eq('id', po.id));
          cargar();
        },
      });
    }
    try {
      await ok(reclutamiento('postulaciones').update({ etapa, motivo_rechazo: null }).eq('id', po.id));
      po.etapa = etapa;
      pintar();
    } catch (error) {
      mostrarError(error);
      pintar();
    }
  }

  async function contratar(po) {
    const vacante = vacantes.find((v) => v.id === vacanteId);
    const catalogos = await cargarCatalogos();
    abrirFormulario({
      titulo: `Contratar a ${nombreCompleto(po.postulante)}`,
      textoGuardar: 'Contratar y crear expediente',
      campos: [
        { nombre: 'departamento_id', etiqueta: 'Departamento', tipo: 'select', requerido: true, opciones: opciones(catalogos.departamentos) },
        { nombre: 'puesto_id', etiqueta: 'Puesto', tipo: 'select', requerido: true, opciones: opciones(catalogos.puestos) },
        { nombre: 'salario', etiqueta: 'Salario base (Q)', tipo: 'number', paso: '0.01', min: 0, requerido: true },
        { nombre: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'date', requerido: true },
      ],
      valores: {
        departamento_id: vacante.departamento_id,
        puesto_id: vacante.puesto_id,
        salario: vacante.salario_ofrecido ?? po.postulante.pretension_salarial,
        fecha_ingreso: hoy(),
      },
      extra: '<p class="texto-suave" style="margin-top:14px">Se creará el empleado en la base de la empresa con los datos del postulante.</p>',
      alGuardar: async (d) => {
        // POST /api/v1/postulaciones/{id}/contratar
        const { datos } = await api(`/postulaciones/${po.id}/contratar`, { metodo: 'POST', cuerpo: d });
        toast('¡Contratado! Se creó el expediente del empleado.');
        navegar(`/empleados/${datos.empleado_id}`);
      },
    });
  }

  const buscar = (id) => postulaciones.find((po) => po.id === id);

  kanban.addEventListener('click', (e) => {
    const b = e.target.closest('[data-entrevista], [data-calificar], [data-contratar]');
    if (!b) return;
    const po = buscar(b.dataset.entrevista ?? b.dataset.calificar ?? b.dataset.contratar);
    if (b.dataset.contratar) return contratar(po);
    if (b.dataset.calificar) {
      return abrirFormulario({
        titulo: `Calificar a ${nombreCompleto(po.postulante)}`,
        campos: [{ nombre: 'calificacion', etiqueta: 'Calificación general', tipo: 'select', requerido: true, completo: true, opciones: [5, 4, 3, 2, 1].map((n) => [n, '★'.repeat(n)]) }],
        valores: po,
        alGuardar: async (d) => {
          await ok(reclutamiento('postulaciones').update({ calificacion: Number(d.calificacion) }).eq('id', po.id));
          cargar();
        },
      });
    }
    abrirFormulario({
      titulo: `Agendar entrevista — ${nombreCompleto(po.postulante)}`,
      campos: [
        { nombre: 'fecha_hora', etiqueta: 'Fecha y hora', tipo: 'datetime-local', requerido: true },
        { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: [['presencial', 'Presencial'], ['virtual', 'Virtual'], ['telefonica', 'Telefónica'], ['tecnica', 'Técnica']] },
        { nombre: 'comentarios', etiqueta: 'Notas', tipo: 'textarea' },
      ],
      alGuardar: async (d) => {
        await ok(reclutamiento('entrevistas').insert({ ...d, postulacion_id: po.id }));
        if (['aplicado', 'filtro'].includes(po.etapa)) await ok(reclutamiento('postulaciones').update({ etapa: 'entrevista' }).eq('id', po.id));
        toast('Entrevista agendada.');
        cargar();
      },
    });
  });

  kanban.addEventListener('change', (e) => {
    const s = e.target.closest('[data-mover]');
    if (s) moverA(buscar(s.dataset.mover), s.value);
  });

  // Arrastrar y soltar
  let arrastrado = null;
  kanban.addEventListener('dragstart', (e) => {
    const f = e.target.closest('.ficha');
    if (!f) return;
    arrastrado = f.dataset.id;
    f.classList.add('arrastrando');
    e.dataTransfer.effectAllowed = 'move';
  });
  kanban.addEventListener('dragend', (e) => e.target.closest('.ficha')?.classList.remove('arrastrando'));
  kanban.addEventListener('dragover', (e) => {
    const col = e.target.closest('.columna');
    if (!col || !arrastrado) return;
    e.preventDefault();
    kanban.querySelectorAll('.sobre').forEach((c) => c !== col && c.classList.remove('sobre'));
    col.classList.add('sobre');
  });
  kanban.addEventListener('drop', (e) => {
    const col = e.target.closest('.columna');
    kanban.querySelectorAll('.sobre').forEach((c) => c.classList.remove('sobre'));
    if (!col || !arrastrado) return;
    e.preventDefault();
    const po = buscar(arrastrado);
    arrastrado = null;
    moverA(po, col.dataset.etapa);
  });

  panelEntrevistas.addEventListener('click', (e) => {
    const b = e.target.closest('[data-resultado]');
    if (!b) return;
    abrirFormulario({
      titulo: 'Resultado de la entrevista',
      campos: [
        { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: [['realizada', 'Realizada'], ['cancelada', 'Cancelada']] },
        { nombre: 'calificacion', etiqueta: 'Calificación', tipo: 'select', opciones: [5, 4, 3, 2, 1].map((n) => [n, '★'.repeat(n)]) },
        { nombre: 'comentarios', etiqueta: 'Comentarios', tipo: 'textarea' },
      ],
      alGuardar: async (d) => {
        await ok(reclutamiento('entrevistas').update({ ...d, calificacion: d.calificacion ? Number(d.calificacion) : null }).eq('id', b.dataset.resultado));
        cargar();
      },
    });
  });

  el.querySelector('#vacante').addEventListener('change', (e) => {
    vacanteId = e.target.value;
    history.replaceState(history.state, '', `/proceso?vacante=${vacanteId}`);
    cargar().catch(mostrarError);
  });

  await cargar();
}
