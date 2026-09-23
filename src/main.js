import { alCambiarAuth, iniciarAuth, obtenerSesion } from './auth.js';
import { iniciarRouter, navegar, recargarVista } from './router.js';
import { configurado } from './supabase.js';

function mostrarFaltaConfiguracion() {
  document.getElementById('app').innerHTML = `<div class="auth-panel" style="min-height:100vh">
    <div class="auth-caja tarjeta tarjeta-cuerpo">
      <h1>Falta configurar Supabase</h1>
      <p class="texto-suave">Copia <code>.env.example</code> como <code>.env</code>, coloca la URL y la
      <em>anon key</em> de tu proyecto y reinicia el servidor con <code>npm run dev</code>.</p>
    </div></div>`;
}

async function arrancar() {
  if (!configurado) return mostrarFaltaConfiguracion();

  // Supabase procesa los tokens de la URL (invitación o recuperación) al iniciar
  await iniciarAuth();

  const params = new URLSearchParams(location.search);
  if (params.has('recuperar')) {
    history.replaceState(null, '', location.pathname);
    if (obtenerSesion()) location.hash = '#/restablecer';
  } else if (/access_token|error_description/.test(location.hash)) {
    location.hash = '#/';
  }

  alCambiarAuth((evento) => {
    if (evento === 'SIGNED_OUT') navegar('/login');
    else recargarVista();
  });

  iniciarRouter();
}

arrancar();
