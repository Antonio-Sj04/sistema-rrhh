// Portal público de empleo: cualquier persona ve las vacantes publicadas y
// postula con su CV mediante la API pública (/api/v1/publico/*).
// La postulación es un formulario de 3 pasos cuyo avance se guarda en
// sessionStorage: sobrevive a recargas, pero se borra al cerrar la pestaña.
import { api } from '../api.js';
import { LOGO, icono } from '../layout.js';
import { selectorTema } from '../tema.js';
import { cargando, esc, fecha, formularioHTML, leerFormulario, mensajeError, modal, moneda } from '../ui.js';

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
      <div class="marca">${LOGO}<div><div class="marca-nombre">Portal de empleo</div><div class="marca-empresa" id="empresa">Recursos Humanos</div></div></div>
      <div class="acciones">${selectorTema()}<a href="/login" class="boton">Acceso personal</a></div>
    </header>
    <section class="portal-hero fondo-marca">
      <span class="pastilla oculto" id="plazas"></span>
      <h1>Trabaja con nosotros<span id="en-empresa"></span></h1>
      <p id="subtitulo">Conoce nuestras vacantes y envía tu CV en minutos.</p>
      <a class="boton boton-claro" href="#vacantes">Ver vacantes →</a>
    </section>
    <main class="portal-contenido" id="vacantes">
      <div class="portal-titulo"><h2>Vacantes disponibles</h2><p class="texto-suave">Aplica a la posición que mejor se ajuste a tu perfil.</p></div>
      <div class="portal-lista" id="lista">${cargando()}</div>
    </main>
    <footer class="portal-pie">Tus datos se usan únicamente para procesos de selección.</footer>
  </div>`;

  const lista = el.querySelector('#lista');
  el.querySelector('.boton-claro').addEventListener('click', (e) => {
    e.preventDefault();
    el.querySelector('#vacantes').scrollIntoView({ behavior: 'smooth' });
  });
  let vacantes;
  let empresa;
  try {
    const [rv, re] = await Promise.all([api('/publico/vacantes'), api('/publico/empresa').catch(() => ({ datos: null }))]);
    vacantes = rv.datos;
    empresa = re.datos?.nombre;
  } catch {
    lista.innerHTML = '<div class="tarjeta vacio">No pudimos cargar las vacantes. Intenta de nuevo más tarde.</div>';
    return;
  }
  if (empresa) {
    el.querySelector('#empresa').textContent = empresa;
    el.querySelector('#en-empresa').innerHTML = ` en <span class="resaltado">${esc(empresa)}</span>`;
    el.querySelector('#subtitulo').textContent = `Conoce las vacantes de ${empresa} y envía tu CV en minutos.`;
    document.title = `Empleos · ${empresa}`;
  }
  const totalPlazas = vacantes.reduce((s, v) => s + (v.plazas ?? 0), 0);
  if (totalPlazas) {
    const pastilla = el.querySelector('#plazas');
    pastilla.innerHTML = `${icono('empleados')} ${totalPlazas} ${totalPlazas === 1 ? 'plaza abierta' : 'plazas abiertas'}`;
    pastilla.classList.remove('oculto');
  }
  if (!vacantes.length) {
    lista.innerHTML = '<div class="tarjeta vacio">Por ahora no tenemos vacantes abiertas. ¡Vuelve pronto!</div>';
    return;
  }

  lista.innerHTML = vacantes
    .map(
      (v) => `<article class="tarjeta portal-vacante" id="v-${v.id}">
        <div class="portal-vacante-cabecera">
          <span class="kpi-icono tono-indigo">${icono('vacantes')}</span>
          <span class="badge badge-exito">${v.plazas} ${v.plazas === 1 ? 'plaza' : 'plazas'}</span>
        </div>
        <h2>${esc(v.titulo)}</h2>
        ${v.descripcion ? `<div class="portal-texto">${parrafos(v.descripcion)}</div>` : ''}
        <div class="portal-meta">
          ${v.departamento ? `<span>${esc(v.departamento)}</span>` : ''}
          ${v.fecha_cierre ? `<span>Cierra el ${fecha(v.fecha_cierre)}</span>` : ''}
        </div>
        ${v.requisitos ? `<details class="portal-requisitos"><summary>Ver requisitos</summary><div class="portal-texto">${parrafos(v.requisitos)}</div></details>` : ''}
        <div class="portal-vacante-pie">
          <div>${v.salario ? `<div class="portal-etiqueta">Salario mensual</div><div class="portal-salario">${moneda(v.salario)}</div>` : ''}</div>
          <button type="button" class="primario" data-postular="${v.id}">${borrador(v.id) ? 'Continuar postulación' : 'Postular →'}</button>
        </div>
      </article>`,
    )
    .join('');

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-postular]');
    if (b) postular(vacantes.find((v) => v.id === b.dataset.postular), empresa, b);
  });

  // Enlace directo a una vacante: /empleos?vacante=ID
  const directa = new URLSearchParams(location.search).get('vacante');
  const vacante = vacantes.find((v) => v.id === directa);
  if (vacante) {
    el.querySelector(`#v-${vacante.id}`).scrollIntoView({ behavior: 'smooth' });
    postular(vacante, empresa, el.querySelector(`[data-postular="${vacante.id}"]`));
  }
}

// ---------------------------------------------------------------------
// Borrador del formulario en sessionStorage
// ---------------------------------------------------------------------
const claveBorrador = (vacanteId) => `rrhh:postulacion:${vacanteId}`;

function borrador(vacanteId) {
  try {
    return JSON.parse(sessionStorage.getItem(claveBorrador(vacanteId)));
  } catch {
    return null;
  }
}

function guardarBorrador(vacanteId, estado) {
  try {
    sessionStorage.setItem(claveBorrador(vacanteId), JSON.stringify(estado));
  } catch {
    // sin almacenamiento: el formulario sigue funcionando, solo no se recuerda
  }
}

function borrarBorrador(vacanteId) {
  try {
    sessionStorage.removeItem(claveBorrador(vacanteId));
  } catch {
    // nada que borrar
  }
}

function pasos(empresa) {
  return [
    {
      titulo: 'Tus datos',
      campos: [
        { nombre: 'nombres', etiqueta: 'Nombres', requerido: true },
        { nombre: 'apellidos', etiqueta: 'Apellidos', requerido: true },
        { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', requerido: true },
        { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', requerido: true, placeholder: 'Ej.: 5555-1234' },
        { nombre: 'dpi', etiqueta: 'DPI / CUI', patron: '\\d{13}', ayuda: '13 dígitos, sin espacios (opcional)', completo: true },
      ],
    },
    {
      titulo: 'Perfil profesional',
      campos: [
        { nombre: 'nivel_academico', etiqueta: 'Nivel académico', tipo: 'select', opciones: NIVELES },
        { nombre: 'profesion', etiqueta: 'Profesión u oficio' },
        { nombre: 'anios_experiencia', etiqueta: 'Años de experiencia', tipo: 'number', min: 0, max: 60, paso: '0.5' },
        { nombre: 'pretension_salarial', etiqueta: 'Pretensión salarial mensual (Q)', tipo: 'number', min: 0, paso: '0.01' },
      ],
    },
    {
      titulo: 'CV y autorización',
      campos: [
        { nombre: 'cv', etiqueta: 'Tu CV en PDF (máx. 5 MB)', tipo: 'file', acepta: '.pdf,application/pdf', requerido: true, completo: true },
        {
          nombre: 'consentimiento', tipo: 'checkbox', requerido: true, completo: true,
          etiqueta: `Autorizo a ${empresa ?? 'la empresa'} a usar mis datos personales únicamente para procesos de selección y a conservarlos hasta por 24 meses.`,
        },
      ],
    },
  ];
}

function postular(vacante, empresa, boton) {
  const PASOS = pasos(empresa);
  // Estado: { paso, datos, inicio } — el archivo del CV no se guarda
  const estado = borrador(vacante.id) ?? { paso: 0, datos: {}, inicio: Date.now() };

  const { el, cerrar } = modal({
    titulo: `Postularme: ${vacante.titulo}`,
    contenido: '<form id="form-postulacion" novalidate></form>',
    pie: `<span class="texto-suave" id="aviso-borrador" style="margin-right:auto;font-size:12px"></span>
      <button type="button" id="atras">Atrás</button>
      <button type="submit" form="form-postulacion" class="primario" id="siguiente"></button>`,
  });
  const form = el.querySelector('form');
  const atras = el.querySelector('#atras');
  const siguiente = el.querySelector('#siguiente');

  function pintar() {
    const paso = PASOS[estado.paso];
    form.innerHTML = `
      <ol class="pasos" aria-label="Progreso">
        ${PASOS.map((p, i) => `<li class="${i < estado.paso ? 'hecho' : i === estado.paso ? 'actual' : ''}">${esc(p.titulo)}</li>`).join('')}
      </ol>
      ${formularioHTML(paso.campos, estado.datos)}
      <div class="portal-trampa" aria-hidden="true">
        <label for="sitio_web">Sitio web</label><input id="sitio_web" name="sitio_web" tabindex="-1" autocomplete="off" />
      </div>`;
    atras.hidden = estado.paso === 0;
    siguiente.textContent = estado.paso === PASOS.length - 1 ? 'Enviar postulación' : 'Siguiente';
    el.querySelector('#aviso-borrador').textContent = Object.keys(estado.datos).length
      ? 'Tu avance se guarda mientras esta pestaña siga abierta.'
      : '';
    form.querySelector('input, select')?.focus();
  }

  function recordarPaso() {
    const campos = PASOS[estado.paso].campos.filter((c) => c.tipo !== 'file');
    Object.assign(estado.datos, leerFormulario(form, campos));
    guardarBorrador(vacante.id, estado);
    if (boton) boton.textContent = 'Continuar postulación';
  }

  form.addEventListener('input', recordarPaso);
  atras.addEventListener('click', () => {
    recordarPaso();
    estado.paso -= 1;
    guardarBorrador(vacante.id, estado);
    pintar();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelector('.error-formulario')?.remove();
    if (!form.reportValidity()) return;
    recordarPaso();
    if (estado.paso < PASOS.length - 1) {
      estado.paso += 1;
      guardarBorrador(vacante.id, estado);
      pintar();
      return;
    }

    const cv = form.cv.files[0];
    try {
      if (!cv || cv.size > MAX_CV) throw new Error('El CV debe ser un PDF de máximo 5 MB.');
      if (cv.type && cv.type !== 'application/pdf') throw new Error('El CV debe ser un archivo PDF.');
      const envio = new FormData();
      for (const [clave, valor] of Object.entries(estado.datos)) {
        if (valor != null && valor !== false) envio.append(clave, String(valor));
      }
      envio.append('vacante_id', vacante.id);
      envio.append('cv', cv);
      envio.append('sitio_web', form.sitio_web.value);
      envio.append('t', String(Date.now() - estado.inicio));

      siguiente.disabled = true;
      // POST /api/v1/publico/postulaciones (multipart/form-data)
      const r = await api('/publico/postulaciones', { metodo: 'POST', formulario: envio });
      borrarBorrador(vacante.id);
      if (boton) boton.textContent = 'Postular →';
      cerrar();
      modal({
        titulo: r?.repetida ? 'Ya habíamos recibido tu postulación' : '¡Postulación enviada!',
        estrecho: true,
        contenido: r?.repetida
          ? `<p>Tu postulación para <strong>${esc(vacante.titulo)}</strong> ya estaba registrada. Te contactaremos si tu perfil avanza en el proceso.</p>`
          : `<p>Gracias, ${esc(estado.datos.nombres)}. Recibimos tu postulación para <strong>${esc(vacante.titulo)}</strong>.</p>
             <p>Revisaremos tu perfil y te contactaremos por correo o teléfono si avanzas en el proceso.</p>`,
        pie: '<button type="button" class="primario" data-cerrar>Entendido</button>',
      });
    } catch (error) {
      form.insertAdjacentHTML('afterbegin', `<div class="error-formulario">${esc(mensajeError(error))}</div>`);
    } finally {
      siguiente.disabled = false;
    }
  });

  pintar();
}
