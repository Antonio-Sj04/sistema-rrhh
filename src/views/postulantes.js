import { tieneRol } from '../auth.js';
import { navegar } from '../router.js';
import { ok, reclutamiento, subirConRegistro } from '../api.js';
import { abrirFormulario, badge, esc, fecha, hoy, moneda, nombreCompleto, opciones, persona, tabla, toast } from '../ui.js';

export const CAMPOS_POSTULANTE = [
  { nombre: 'nombres', etiqueta: 'Nombres', requerido: true },
  { nombre: 'apellidos', etiqueta: 'Apellidos', requerido: true },
  { nombre: 'dpi', etiqueta: 'DPI / CUI', patron: '\\d{13}', ayuda: '13 dígitos' },
  { nombre: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'date' },
  { nombre: 'email', etiqueta: 'Correo', tipo: 'email' },
  { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
  { nombre: 'direccion', etiqueta: 'Dirección', completo: true },
  {
    nombre: 'nivel_academico', etiqueta: 'Nivel académico', tipo: 'select',
    opciones: [['primaria', 'Primaria'], ['basicos', 'Básicos'], ['diversificado', 'Diversificado'], ['tecnico', 'Técnico'], ['licenciatura', 'Licenciatura'], ['maestria', 'Maestría'], ['doctorado', 'Doctorado']],
  },
  { nombre: 'profesion', etiqueta: 'Profesión u oficio' },
  { nombre: 'anios_experiencia', etiqueta: 'Años de experiencia', tipo: 'number', paso: '0.5', min: 0 },
  { nombre: 'pretension_salarial', etiqueta: 'Pretensión salarial (Q)', tipo: 'number', paso: '0.01', min: 0 },
  {
    nombre: 'fuente', etiqueta: '¿Cómo se enteró de la vacante?', tipo: 'select',
    opciones: [['portal_empleo', 'Portal de empleo'], ['referido', 'Referido'], ['bolsa_empleo', 'Bolsa de empleo'], ['redes_sociales', 'Redes sociales'], ['universidad', 'Universidad'], ['otro', 'Otro']],
  },
  { nombre: 'notas', etiqueta: 'Notas internas', tipo: 'textarea' },
  { nombre: 'consentimiento_datos', etiqueta: 'El postulante autorizó el tratamiento de sus datos personales', tipo: 'checkbox', completo: true },
];

export async function render(el) {
  const puedeEditar = tieneRol('admin', 'rrhh');
  const [postulantes, vacantes] = await Promise.all([
    ok(reclutamiento('postulantes').select('*, postulaciones(etapa, vacante:vacantes(titulo))').order('created_at', { ascending: false })),
    ok(reclutamiento('vacantes').select('id, titulo').eq('estado', 'abierta').order('titulo')),
  ]);

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Postulantes</h1><p>Banco de candidatos, currículums y antecedentes.</p></div>
      <div class="acciones">${puedeEditar ? '<button type="button" class="primario" id="nuevo">+ Nuevo postulante</button>' : ''}</div>
    </div>
    <div class="tarjeta">
      <div class="filtros"><input type="search" id="buscar" placeholder="Buscar por nombre, profesión, DPI o correo…" /></div>
      <div id="lista"></div>
    </div>`;

  const lista = el.querySelector('#lista');
  const buscar = el.querySelector('#buscar');

  const pintar = () => {
    const t = buscar.value.trim().toLowerCase();
    const filas = postulantes.filter((p) =>
      `${nombreCompleto(p)} ${p.profesion ?? ''} ${p.dpi ?? ''} ${p.email ?? ''}`.toLowerCase().includes(t),
    );
    lista.innerHTML = tabla(
      [
        { titulo: 'Postulante', render: (p) => persona(p, p.email) },
        { titulo: 'Profesión', campo: 'profesion' },
        { titulo: 'Experiencia', render: (p) => (p.anios_experiencia != null ? `${p.anios_experiencia} años` : '—') },
        { titulo: 'Pretensión', render: (p) => (p.pretension_salarial ? moneda(p.pretension_salarial) : '—'), clase: 'numero' },
        {
          titulo: 'Postulaciones',
          render: (p) => p.postulaciones.map((po) => `${esc(po.vacante.titulo)} ${badge(po.etapa)}`).join('<br/>') || '—',
        },
        { titulo: 'CV', render: (p) => (p.cv_ruta ? badge('activo', 'Adjunto') : badge('pendiente', 'Sin CV')) },
        { titulo: 'Registro', render: (p) => fecha(p.created_at) },
      ],
      filas,
      { clicable: true, vacio: 'No hay postulantes registrados.' },
    );
  };

  buscar.addEventListener('input', pintar);
  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    if (fila) navegar(`/postulantes/${fila.dataset.id}`);
  });

  el.querySelector('#nuevo')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Nuevo postulante',
      campos: [
        ...CAMPOS_POSTULANTE,
        { nombre: 'vacante_id', etiqueta: 'Postula a la vacante', tipo: 'select', opciones: opciones(vacantes, (v) => v.titulo) },
        { nombre: 'cv', etiqueta: 'Currículum (PDF, máx. 5 MB)', tipo: 'file', acepta: '.pdf', completo: true },
      ],
      alGuardar: async ({ vacante_id, ...datos }, form) => {
        if (datos.consentimiento_datos) datos.fecha_consentimiento = hoy();
        const [nuevo] = await ok(reclutamiento('postulantes').insert(datos).select('id'));
        const archivo = form.cv.files[0];
        if (archivo) {
          await subirConRegistro('cvs', nuevo.id, archivo, (ruta) =>
            ok(reclutamiento('postulantes').update({ cv_ruta: ruta }).eq('id', nuevo.id)));
        }
        if (vacante_id) await ok(reclutamiento('postulaciones').insert({ postulante_id: nuevo.id, vacante_id }));
        toast('Postulante registrado.');
        navegar(`/postulantes/${nuevo.id}`);
      },
    }),
  );

  pintar();
}
