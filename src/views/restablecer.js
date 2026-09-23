import { cambiarPassword, inicioPorRol } from '../auth.js';
import { navegar } from '../router.js';
import { esc, mensajeError, toast } from '../ui.js';

export function render(el) {
  el.innerHTML = `<div class="auth-panel" style="min-height:100vh">
    <div class="auth-caja tarjeta tarjeta-cuerpo">
      <h1>Crear nueva contraseña</h1>
      <p class="texto-suave">Usa al menos 8 caracteres, combinando letras y números.</p>
      <form>
        <div id="mensaje"></div>
        <div class="campo"><label for="p1">Nueva contraseña</label>
          <input id="p1" type="password" minlength="8" autocomplete="new-password" required /></div>
        <div class="campo"><label for="p2">Confirmar contraseña</label>
          <input id="p2" type="password" minlength="8" autocomplete="new-password" required /></div>
        <button class="primario" type="submit">Guardar contraseña</button>
      </form>
    </div></div>`;

  const form = el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mensaje = el.querySelector('#mensaje');
    if (form.p1.value !== form.p2.value) {
      mensaje.innerHTML = '<div class="error-formulario">Las contraseñas no coinciden.</div>';
      return;
    }
    try {
      await cambiarPassword(form.p1.value);
      toast('Contraseña actualizada.');
      navegar(inicioPorRol());
    } catch (error) {
      mensaje.innerHTML = `<div class="error-formulario">${esc(mensajeError(error))}</div>`;
    }
  });
}
