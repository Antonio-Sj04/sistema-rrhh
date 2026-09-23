import { iniciarSesion, inicioPorRol, solicitarRecuperacion } from '../auth.js';
import { navegar } from '../router.js';
import { esc, mensajeError, toast } from '../ui.js';

export function render(el) {
  el.innerHTML = `<div class="auth">
    <section class="auth-arte">
      <div class="marca"><span class="marca-logo">RH</span> Sistema RRHH</div>
      <div>
        <h2>Gestiona tu talento humano en un solo lugar.</h2>
        <ul>
          <li>Expedientes de empleados y contratos</li>
          <li>Nómina con IGSS, ISR, Bono 14 y Aguinaldo</li>
          <li>Vacaciones, permisos y evaluaciones</li>
          <li>Reclutamiento: vacantes, CV y antecedentes</li>
        </ul>
      </div>
      <small>Acceso exclusivo para personal autorizado.</small>
    </section>
    <section class="auth-panel">
      <div class="auth-caja" id="caja"></div>
    </section>
  </div>`;
  mostrarLogin(el.querySelector('#caja'));
}

function mostrarLogin(caja) {
  caja.innerHTML = `
    <h1>Iniciar sesión</h1>
    <p class="texto-suave">Ingresa con el correo que te asignó Recursos Humanos.</p>
    <form id="form-login">
      <div id="mensaje"></div>
      <div class="campo"><label for="email">Correo electrónico</label>
        <input id="email" type="email" autocomplete="username" required /></div>
      <div class="campo"><label for="password">Contraseña</label>
        <input id="password" type="password" autocomplete="current-password" required /></div>
      <button class="primario" type="submit">Ingresar</button>
      <button class="enlace" type="button" id="olvide">¿Olvidaste tu contraseña?</button>
    </form>`;

  const form = caja.querySelector('form');
  form.email.focus();
  caja.querySelector('#olvide').addEventListener('click', () => mostrarRecuperar(caja, form.email.value));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('.primario');
    boton.disabled = true;
    boton.textContent = 'Ingresando…';
    try {
      await iniciarSesion(form.email.value.trim(), form.password.value);
      navegar(inicioPorRol());
    } catch (error) {
      caja.querySelector('#mensaje').innerHTML = `<div class="error-formulario">${esc(mensajeError(error))}</div>`;
      boton.disabled = false;
      boton.textContent = 'Ingresar';
    }
  });
}

function mostrarRecuperar(caja, email = '') {
  caja.innerHTML = `
    <h1>Recuperar contraseña</h1>
    <p class="texto-suave">Te enviaremos un enlace para crear una nueva contraseña.</p>
    <form id="form-recuperar">
      <div class="campo"><label for="email">Correo electrónico</label>
        <input id="email" type="email" required value="${esc(email)}" /></div>
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
