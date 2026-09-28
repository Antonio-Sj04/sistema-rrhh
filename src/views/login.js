import { api } from '../api.js';
import { iniciarSesion, inicioPorRol, solicitarRecuperacion } from '../auth.js';
import { LOGO, icono } from '../layout.js';
import { navegar } from '../router.js';
import { selectorTema } from '../tema.js';
import { esc, mensajeError, toast } from '../ui.js';

const SIMBOLOS = {
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  candado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chispa: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
};
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

/** Campo con ícono a la izquierda. */
const campoIcono = (id, etiqueta, simbolo, atributos, extra = '') => `<div class="campo"><label for="${id}">${etiqueta}</label>
  <div class="entrada-icono">${svg(SIMBOLOS[simbolo])}<input id="${id}" ${atributos} />${extra}</div></div>`;

export function render(el) {
  el.innerHTML = `<div class="auth">
    <section class="auth-arte fondo-marca">
      <div class="marca">${LOGO}<div><div class="marca-nombre">Sistema RRHH</div><div class="marca-empresa" data-empresa>Recursos Humanos</div></div></div>
      <div class="auth-mensaje">
        <span class="pastilla">${svg(SIMBOLOS.chispa)} Portal de Recursos Humanos</span>
        <h2>El talento de tu empresa, organizado en un solo lugar.</h2>
        <p>Gestiona empleados, nómina, vacaciones y reclutamiento con la agilidad que Guatemala necesita.</p>
        <div class="auth-rasgos">
          <div>${icono('nomina')}<strong>Nómina GT</strong><span>IGSS, ISR, Bono 14 y Aguinaldo</span></div>
          <div>${icono('proceso')}<strong>Reclutamiento</strong><span>Portal de empleo y tablero Kanban</span></div>
          <div>${svg(SIMBOLOS.escudo)}<strong>Seguridad</strong><span>Roles, RLS y cookies seguras</span></div>
        </div>
      </div>
      <small>© ${new Date().getFullYear()} · <span data-empresa>Recursos Humanos</span> · Acceso exclusivo para personal autorizado</small>
    </section>
    <section class="auth-panel">
      <div class="auth-tema">${selectorTema()}</div>
      <div class="auth-caja" id="caja"></div>
    </section>
  </div>`;
  api('/publico/empresa')
    .then((r) => r.datos?.nombre && el.querySelectorAll('[data-empresa]').forEach((e) => (e.textContent = r.datos.nombre)))
    .catch(() => {});
  mostrarLogin(el.querySelector('#caja'));
}

function mostrarLogin(caja) {
  caja.innerHTML = `
    <div class="auth-logo-movil">${LOGO}</div>
    <h1>Bienvenido de vuelta</h1>
    <p class="texto-suave">Ingresa con el correo que te asignó Recursos Humanos.</p>
    <form id="form-login">
      <div id="mensaje"></div>
      ${campoIcono('email', 'Correo electrónico', 'correo', 'type="email" autocomplete="username" required placeholder="nombre@empresa.com"')}
      ${campoIcono('password', 'Contraseña', 'candado', 'type="password" autocomplete="current-password" required', `<button type="button" class="ver-clave" aria-label="Mostrar contraseña" title="Mostrar contraseña">${svg(SIMBOLOS.ojo)}</button>`)}
      <div class="auth-opciones">
        <label class="campo-check" title="Solo en dispositivos personales"><input id="recordar" type="checkbox" /> Mantener sesión iniciada</label>
        <button class="enlace" type="button" id="olvide">¿Olvidaste tu contraseña?</button>
      </div>
      <button class="primario" type="submit">Iniciar sesión</button>
    </form>
    <p class="texto-suave auth-pie">¿Interesado en trabajar con nosotros? <a href="/empleos">Ver vacantes</a></p>`;

  caja.querySelector('.ver-clave').addEventListener('click', (e) => {
    const input = caja.querySelector('#password');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    e.currentTarget.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
  const form = caja.querySelector('form');
  form.email.focus();
  caja.querySelector('#olvide').addEventListener('click', () => mostrarRecuperar(caja, form.email.value));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('.primario');
    boton.disabled = true;
    boton.textContent = 'Ingresando…';
    try {
      await iniciarSesion(form.email.value.trim(), form.password.value, form.recordar.checked);
      navegar(inicioPorRol());
    } catch (error) {
      caja.querySelector('#mensaje').innerHTML = `<div class="error-formulario">${esc(mensajeError(error))}</div>`;
      boton.disabled = false;
      boton.textContent = 'Iniciar sesión';
    }
  });
}

function mostrarRecuperar(caja, email = '') {
  caja.innerHTML = `
    <h1>Recuperar contraseña</h1>
    <p class="texto-suave">Te enviaremos un enlace para crear una nueva contraseña.</p>
    <form id="form-recuperar">
      ${campoIcono('email', 'Correo electrónico', 'correo', `type="email" required value="${esc(email)}"`)}
      <button class="primario" type="submit">Enviar enlace</button>
      <button class="enlace" type="button" id="volver">Volver al inicio de sesión</button>
    </form>`;
  const form = caja.querySelector('form');
  caja.querySelector('#volver').addEventListener('click', () => mostrarLogin(caja));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await solicitarRecuperacion(form.email.value.trim());
      toast('Si el correo existe, recibirás un enlace en unos minutos.');
      mostrarLogin(caja);
    } catch (error) {
      toast(mensajeError(error), 'error');
    }
  });
}
