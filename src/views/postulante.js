import { tieneRol } from '../auth.js';
import { ETAPAS } from '../catalogos.js';
import { navegar, recargarVista } from '../router.js';
import { botonArchivo, sublista } from '../sublista.js';
import { empresa, ok, reclutamiento, subirArchivo, supabase } from '../supabase.js';
import {
  abrirFormulario, badge, confirmar, esc, estrellas, etiqueta, fecha, hoy, iniciales, moneda, montarPestanas,
  mostrarError, nombreCompleto, opciones, toast,
} from '../ui.js';
import { CAMPOS_POSTULANTE } from './postulantes.js';

export async function render(el, { id }) {
  const puedeEditar = tieneRol('admin', 'rrhh');
  const p = await ok(reclutamiento('postulantes').select('*').eq('id', id).single());

  el.innerHTML = `
    <a class="miga" href="#/postulantes">← Postulantes</a>
    <div class="encabezado">
      <div class="persona"><span class="avatar grande">${esc(iniciales(p))}</span>
        <div><h1>${esc(nombreCompleto(p))}</h1>
        <p>${esc(p.profesion ?? 'Sin profesión registrada')} · Registrado el ${fecha(p.created_at)}</p></div></div>
      <div class="acciones">
        ${p.cv_ruta ? botonArchivo('cvs', p.cv_ruta, 'Ver CV').replace('class="enlace"', 'class="boton"') : ''}
        ${puedeEditar ? '<button type="button" id="cv">Subir CV</button><button type="button" id="editar">Editar</button><button type="button" class="peligro" id="eliminar">Eliminar</button>' : ''}
      </div>
    </div>
    <div class="tarjeta" id="pestanas"></div>`;

  const d = (t, v) => `<div><dt>${esc(t)}</dt><dd>${v ?? '—'}</dd></div>`;
  const lista = (tabla) => ok(reclutamiento(tabla).select('*').eq('postulante_id', id));
  const borrar = (tabla) => (fila) => ok(reclutamiento(tabla).delete().eq('id', fila.id));
  const insertar = (tabla) => (datos) => ok(reclutamiento(tabla).insert({ ...datos, postulante_id: id }));

  montarPestanas(el.querySelector('#pestanas'), [
    {
      id: 'datos',
      titulo: 'Datos personales',
      render: (panel) => {
        panel.innerHTML = `<div class="tarjeta-cuerpo"><dl class="datos">
          ${d('DPI', esc(p.dpi))}${d('Fecha de nacimiento', fecha(p.fecha_nacimiento))}
          ${d('Correo', esc(p.email))}${d('Teléfono', esc(p.telefono))}${d('Dirección', esc(p.direccion))}
          ${d('Nivel académico', esc(etiqueta(p.nivel_academico)))}${d('Profesión', esc(p.profesion))}
          ${d('Años de experiencia', esc(p.anios_experiencia))}
          ${d('Pretensión salarial', p.pretension_salarial ? moneda(p.pretension_salarial) : null)}
          ${d('Fuente', esc(etiqueta(p.fuente)))}
          ${d('Consentimiento de datos', p.consentimiento_datos ? `${badge('activo', 'Otorgado')} ${fecha(p.fecha_consentimiento)}` : badge('pendiente', 'Pendiente'))}
          ${d('Notas', esc(p.notas))}
        </dl></div>`;
      },
    },
    {
      id: 'postulaciones',
      titulo: 'Postulaciones',
      render: async (panel) => {
        const vacantes = await ok(reclutamiento('vacantes').select('id, titulo').eq('estado', 'abierta').order('titulo'));
        return sublista(panel, {
          titulo: 'Vacantes a las que aplica',
          textoNuevo: 'Postular a vacante',
          puedeEditar,
          cargar: () => ok(reclutamiento('postulaciones').select('*, vacante:vacantes(titulo, estado)').eq('postulante_id', id).order('created_at', { ascending: false })),
          columnas: [
            { titulo: 'Vacante', render: (po) => esc(po.vacante.titulo) },
            { titulo: 'Etapa', render: (po) => badge(po.etapa, ETAPAS.find(([v]) => v === po.etapa)?.[1]) },
            { titulo: 'Calificación', render: (po) => estrellas(po.calificacion) },
            { titulo: 'Fecha', render: (po) => fecha(po.created_at) },
            { titulo: 'Motivo de rechazo', campo: 'motivo_rechazo' },
          ],
          campos: [{ nombre: 'vacante_id', etiqueta: 'Vacante', tipo: 'select', requerido: true, completo: true, opciones: opciones(vacantes, (v) => v.titulo) }],
          guardar: insertar('postulaciones'),
          eliminar: borrar('postulaciones'),
          vacio: 'Este postulante no está en ningún proceso.',
        });
      },
    },
    {
      id: 'antecedentes',
      titulo: 'Antecedentes',
      render: (panel) =>
        sublista(panel, {
          titulo: 'Constancias y verificaciones',
          textoNuevo: 'Registrar antecedente',
          puedeEditar,
          cargar: () => lista('antecedentes'),
          columnas: [
            { titulo: 'Tipo', render: (a) => esc(etiqueta(a.tipo)) },
            { titulo: 'Emisión', render: (a) => fecha(a.fecha_emision) },
            { titulo: 'Resultado', render: (a) => badge(a.resultado) },
            { titulo: 'Observaciones', campo: 'observaciones' },
            { titulo: 'Documento', render: (a) => botonArchivo('cvs', a.documento_ruta) },
          ],
          campos: [
            {
              nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true,
              opciones: [['penales', 'Antecedentes penales'], ['policiacos', 'Antecedentes policíacos'], ['renas', 'RENAS'], ['referencias_laborales', 'Referencias laborales'], ['buro_credito', 'Buró de crédito'], ['otro', 'Otro']],
            },
            { nombre: 'fecha_emision', etiqueta: 'Fecha de emisión', tipo: 'date' },
            { nombre: 'resultado', etiqueta: 'Resultado', tipo: 'select', requerido: true, opciones: [['pendiente', 'Pendiente'], ['sin_registro', 'Sin registro'], ['con_registro', 'Con registro']] },
            { nombre: 'documento', etiqueta: 'Constancia escaneada', tipo: 'file', completo: true },
            { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea' },
          ],
          guardar: async (datos, form) => {
            const archivo = form.documento.files[0];
            const documento_ruta = archivo ? await subirArchivo('cvs', `${id}/antecedentes`, archivo) : null;
            await insertar('antecedentes')({ ...datos, documento_ruta });
          },
          eliminar: async (a) => {
            if (a.documento_ruta) await supabase.storage.from('cvs').remove([a.documento_ruta]);
            await borrar('antecedentes')(a);
          },
          vacio: 'Sin antecedentes registrados.',
        }),
    },
    {
      id: 'experiencia',
      titulo: 'Experiencia',
      render: (panel) =>
        sublista(panel, {
          titulo: 'Experiencia laboral',
          textoNuevo: 'Agregar experiencia',
          puedeEditar,
          cargar: () => lista('experiencia'),
          columnas: [
            { titulo: 'Empresa', campo: 'empresa' },
            { titulo: 'Puesto', campo: 'puesto' },
            { titulo: 'Desde', render: (x) => fecha(x.fecha_inicio) },
            { titulo: 'Hasta', render: (x) => (x.fecha_fin ? fecha(x.fecha_fin) : 'Actual') },
            { titulo: 'Funciones', campo: 'funciones' },
          ],
          campos: [
            { nombre: 'empresa', etiqueta: 'Empresa', requerido: true },
            { nombre: 'puesto', etiqueta: 'Puesto', requerido: true },
            { nombre: 'fecha_inicio', etiqueta: 'Desde', tipo: 'date' },
            { nombre: 'fecha_fin', etiqueta: 'Hasta (vacío si es actual)', tipo: 'date' },
            { nombre: 'funciones', etiqueta: 'Funciones principales', tipo: 'textarea' },
          ],
          guardar: insertar('experiencia'),
          eliminar: borrar('experiencia'),
        }),
    },
    {
      id: 'educacion',
      titulo: 'Educación',
      render: (panel) =>
        sublista(panel, {
          titulo: 'Formación académica',
          textoNuevo: 'Agregar estudio',
          puedeEditar,
          cargar: () => lista('educacion'),
          columnas: [
            { titulo: 'Institución', campo: 'institucion' },
            { titulo: 'Título', campo: 'titulo' },
            { titulo: 'Nivel', render: (x) => esc(etiqueta(x.nivel)) },
            { titulo: 'Período', render: (x) => esc([x.anio_inicio, x.anio_fin ?? 'En curso'].filter(Boolean).join(' – ')) },
          ],
          campos: [
            { nombre: 'institucion', etiqueta: 'Institución', requerido: true },
            { nombre: 'titulo', etiqueta: 'Título obtenido', requerido: true },
            { nombre: 'nivel', etiqueta: 'Nivel', tipo: 'select', opciones: CAMPOS_POSTULANTE.find((c) => c.nombre === 'nivel_academico').opciones },
            { nombre: 'anio_inicio', etiqueta: 'Año de inicio', tipo: 'number', min: 1950, max: 2100 },
            { nombre: 'anio_fin', etiqueta: 'Año de finalización', tipo: 'number', min: 1950, max: 2100 },
          ],
          guardar: insertar('educacion'),
          eliminar: borrar('educacion'),
        }),
    },
    {
      id: 'referencias',
      titulo: 'Referencias',
      render: (panel) =>
        sublista(panel, {
          titulo: 'Referencias personales y laborales',
          textoNuevo: 'Agregar referencia',
          puedeEditar,
          cargar: () => lista('referencias'),
          columnas: [
            { titulo: 'Nombre', campo: 'nombre' },
            { titulo: 'Relación', campo: 'relacion' },
            { titulo: 'Empresa', campo: 'empresa' },
            { titulo: 'Teléfono', campo: 'telefono' },
            { titulo: 'Verificada', render: (r) => (r.verificada ? badge('activo', 'Sí') : badge('pendiente', 'No')) },
            { titulo: 'Comentarios', campo: 'comentarios' },
          ],
          campos: [
            { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
            { nombre: 'relacion', etiqueta: 'Relación', placeholder: 'Ej. Jefe anterior' },
            { nombre: 'empresa', etiqueta: 'Empresa' },
            { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
            { nombre: 'verificada', etiqueta: 'Referencia verificada', tipo: 'checkbox', completo: true },
            { nombre: 'comentarios', etiqueta: 'Comentarios', tipo: 'textarea' },
          ],
          guardar: insertar('referencias'),
          eliminar: borrar('referencias'),
        }),
    },
  ]);

  el.querySelector('#editar')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Editar postulante',
      campos: CAMPOS_POSTULANTE,
      valores: p,
      alGuardar: async (datos) => {
        if (datos.consentimiento_datos && !p.consentimiento_datos) datos.fecha_consentimiento = hoy();
        await ok(reclutamiento('postulantes').update(datos).eq('id', id));
        recargarVista();
      },
    }),
  );

  el.querySelector('#cv')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Subir currículum',
      textoGuardar: 'Subir',
      campos: [{ nombre: 'cv', etiqueta: 'Archivo PDF (máx. 10 MB)', tipo: 'file', acepta: '.pdf', requerido: true, completo: true }],
      alGuardar: async (_, form) => {
        const ruta = await subirArchivo('cvs', id, form.cv.files[0]);
        await ok(reclutamiento('postulantes').update({ cv_ruta: ruta }).eq('id', id));
        if (p.cv_ruta) await supabase.storage.from('cvs').remove([p.cv_ruta]);
        toast('CV actualizado.');
        recargarVista();
      },
    }),
  );

  el.querySelector('#eliminar')?.addEventListener('click', async () => {
    const contratado = await ok(empresa('empleados').select('id').eq('postulante_id', id).limit(1));
    const aviso = contratado.length
      ? 'Este postulante ya fue contratado; se eliminará solo su registro de reclutamiento. ¿Continuar?'
      : 'Se eliminarán todos sus datos, CV y antecedentes. Esta acción no se puede deshacer. ¿Continuar?';
    if (!(await confirmar(aviso, { textoAceptar: 'Eliminar', peligro: true }))) return;
    try {
      const { data: archivos } = await supabase.storage.from('cvs').list(id);
      const { data: docs } = await supabase.storage.from('cvs').list(`${id}/antecedentes`);
      const rutas = [
        ...(archivos ?? []).filter((a) => a.id).map((a) => `${id}/${a.name}`),
        ...(docs ?? []).map((a) => `${id}/antecedentes/${a.name}`),
      ];
      if (rutas.length) await supabase.storage.from('cvs').remove(rutas);
      await ok(reclutamiento('postulantes').delete().eq('id', id));
      toast('Postulante eliminado.');
      navegar('/postulantes');
    } catch (error) {
      mostrarError(error);
    }
  });
}
