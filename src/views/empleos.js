// Portal público de empleo: cualquier persona ve las vacantes publicadas y
// postula con su CV. Los envíos pasan por la Edge Function "postular".
import { supabase } from '../supabase.js';
import { abrirFormulario, cargando, esc, fecha, modal, moneda } from '../ui.js';

const MAX_CV = 5 * 1024 * 1024;

const NIVELES = [
  ['diversificado', 'Diversificado'], ['tecnico', 'Técnico'], ['licenciatura', 'Licenciatura'],
  ['maestria', 'Maestría'], ['doctorado', 'Doctorado'], ['basicos', 'Básicos'], ['primaria', 'Primaria'],
];

const parrafos = (texto) =>
  esc(texto ?? '')
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join('');

export async function render(el) {
  el.innerHTML = `<div class="portal">
    <header class="portal-cabecera">
      <div class="portal-marca"><span class="marca-logo">RH</span><span id="empresa">Portal de empleo</span></div>
      <a href="#/login" class="boton pequeno">Acceso personal</a>
    </header>
    <section class="portal-hero">
      <h1>Trabaja con nosotros</h1>
      <p id="subtitulo">Conoce nuestras vacantes y envía tu CV en minutos.</p>
    </section>
    <main class="portal-lista" id="lista">${cargando()}</main>
    <footer class="portal-pie">Tus datos se usan únicamente para procesos de selección.</footer>
  </div>`;

  const [{ data: vacantes, error }, { data: empresas }] = await Promise.all([
    supabase.rpc('vacantes_publicas'),
    supabase.rpc('empresa_publica'),
  ]);
  const empresa = empresas?.[0]?.nombre;
  if (empresa) {
    el.querySelector('#empresa').textContent = empresa;
    el.querySelector('#subtitulo').textContent = `Conoce las vacantes de ${empresa} y envía tu CV en minutos.`;
    document.title = `Empleos · ${empresa}`;
  }

  const lista = el.querySelector('#lista');
  if (error) {
    lista.innerHTML = '<div class="tarjeta vacio">No pudimos cargar las vacantes. Intenta de nuevo más tarde.</div>';
    return;
  }
  if (!vacantes.length) {
    lista.innerHTML = '<div class="tarjeta vacio">Por ahora no tenemos vacantes abiertas. ¡Vuelve pronto!</div>';
    return;
  }

  lista.innerHTML = vacantes
    .map(
      (v) => `<article class="tarjeta portal-vacante" id="v-${v.id}">
        <div class="tarjeta-cuerpo">
          <div class="portal-vacante-cabecera">
            <div>
              <h2>${esc(v.titulo)}</h2>
              <div class="portal-meta">
                ${v.departamento ? `<span>${esc(v.departamento)}</span>` : ''}
                <span>${v.plazas} ${v.plazas === 1 ? 'plaza' : 'plazas'}</span>
                ${v.salario ? `<span>${moneda(v.salario)} mensuales</span>` : ''}
                ${v.fecha_cierre ? `<span>Cierra el ${fecha(v.fecha_cierre)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="primario" data-postular="${v.id}">Postularme</button>
          </div>
          ${v.descripcion ? `<div class="portal-texto">${parrafos(v.descripcion)}</div>` : ''}
          ${v.requisitos ? `<h3>Requisitos</h3><div class="portal-texto">${parrafos(v.requisitos)}</div>` : ''}
        </div>
      </article>`,
    )
    .join('');

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-postular]');
    if (b) postular(vacantes.find((v) => v.id === b.dataset.postular), empresa);
  });

  // Enlace directo a una vacante: #/empleos?vacante=ID
  const directa = new URLSearchParams(location.hash.split('?')[1]).get('vacante');
  const vacante = vacantes.find((v) => v.id === directa);
  if (vacante) {
    el.querySelector(`#v-${vacante.id}`).scrollIntoView({ behavior: 'smooth' });
    postular(vacante, empresa);
  }
}

function postular(vacante, empresa) {
  const abierto = Date.now();
  const campos = [
    { nombre: 'nombres', etiqueta: 'Nombres', requerido: true },
    { nombre: 'apellidos', etiqueta: 'Apellidos', requerido: true },
    { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', requerido: true },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', requerido: true, placeholder: 'Ej.: 5555-1234' },
    { nombre: 'dpi', etiqueta: 'DPI / CUI', patron: '\\d{13}', ayuda: '13 dígitos, sin espacios (opcional)' },
    { nombre: 'nivel_academico', etiqueta: 'Nivel académico', tipo: 'select', opciones: NIVELES },
    { nombre: 'profesion', etiqueta: 'Profesión u oficio' },
    { nombre: 'anios_experiencia', etiqueta: 'Años de experiencia', tipo: 'number', min: 0, max: 60, paso: '0.5' },
    { nombre: 'pretension_salarial', etiqueta: 'Pretensión salarial mensual (Q)', tipo: 'number', min: 0, paso: '0.01', completo: true },
    { nombre: 'cv', etiqueta: 'Tu CV en PDF (máx. 5 MB)', tipo: 'file', acepta: '.pdf,application/pdf', requerido: true, completo: true },
    {
      nombre: 'consentimiento', tipo: 'checkbox', requerido: true, completo: true,
      etiqueta: `Autorizo a ${empresa ?? 'la empresa'} a usar mis datos personales únicamente para procesos de selección y a conservarlos hasta por 24 meses.`,
    },
  ];

  abrirFormulario({
    titulo: `Postularme: ${vacante.titulo}`,
    textoGuardar: 'Enviar postulación',
    campos,
    // Campo trampa: invisible para personas, los bots suelen llenarlo
    extra: `<div class="portal-trampa" aria-hidden="true">
      <label for="sitio_web">Sitio web</label><input id="sitio_web" name="sitio_web" tabindex="-1" autocomplete="off" /></div>`,
    alGuardar: async (datos, form) => {
      const cv = form.cv.files[0];
      if (!cv || cv.size > MAX_CV) throw new Error('El CV debe ser un PDF de máximo 5 MB.');
      if (cv.type && cv.type !== 'application/pdf') throw new Error('El CV debe ser un archivo PDF.');

      const envio = new FormData();
      for (const [clave, valor] of Object.entries(datos)) {
        if (valor != null && valor !== false) envio.append(clave, String(valor));
      }
      envio.append('vacante_id', vacante.id);
      envio.append('cv', cv);
      envio.append('sitio_web', form.sitio_web.value);
      envio.append('t', String(Date.now() - abierto));

      const { data, error } = await supabase.functions.invoke('postular', { body: envio });
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null);
        throw new Error(detalle?.error ?? 'No se pudo enviar tu postulación. Inténtalo de nuevo.');
      }
      modal({
        titulo: data?.repetida ? 'Ya habíamos recibido tu postulación' : '¡Postulación enviada!',
        estrecho: true,
        contenido: data?.repetida
          ? `<p>Tu postulación para <strong>${esc(vacante.titulo)}</strong> ya estaba registrada. Te contactaremos si tu perfil avanza en el proceso.</p>`
          : `<p>Gracias, ${esc(datos.nombres)}. Recibimos tu postulación para <strong>${esc(vacante.titulo)}</strong>.</p>
             <p>Revisaremos tu perfil y te contactaremos por correo o teléfono si avanzas en el proceso.</p>`,
        pie: '<button type="button" class="primario" data-cerrar>Entendido</button>',
      });
    },
  });
}
