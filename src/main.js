import { alCambiarAuth, iniciarAuth, obtenerSesion } from './auth.js';
import { iniciarRouter, navegar, recargarVista } from './router.js';
import { configurado, supabase } from './supabase.js';
import { toast } from './ui.js';

function mostrarFaltaConfiguracion() {
  document.getElementById('app').innerHTML = `<div class="auth-panel" style="min-height:100vh">
    <div class="auth-caja tarjeta tarjeta-cuerpo">
      <h1>Falta configurar Supabase</h1>
      <p class="texto-suave">Copia <code>.env.example</code> como <code>.env</code>, coloca la URL y la
      <em>anon key</em> de tu proyecto y reinicia el servidor con <code>npm run dev</code>.</p>
    </div></div>`;
}

// Enlaces de los correos (invitación, recuperación, cambio de correo) que
// apuntan al propio sitio: ?token_hash=...&type=...
const TIPOS_ENLACE = ['invite', 'recovery', 'email_change', 'signup', 'magiclink'];

async function verificarEnlaceDeCorreo() {
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get('token_hash');
  const tipo = params.get('type');
  if (!tokenHash || !TIPOS_ENLACE.includes(tipo)) return null;
  // Se quita el token de la barra de direcciones antes de usarlo
  history.replaceState(null, '', location.pathname);
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
  return error ? 'error' : tipo;
}

async function arrancar() {
  if (!configurado) return mostrarFaltaConfiguracion();

  const enlace = await verificarEnlaceDeCorreo();
  // Supabase procesa los tokens de la URL (invitación o recuperación) al iniciar
  await iniciarAuth();

  const params = new URLSearchParams(location.search);
  if (enlace === 'invite' || enlace === 'recovery') {
    location.hash = '#/restablecer';
  } else if (enlace === 'email_change') {
    toast('Tu correo fue actualizado.');
  } else if (enlace === 'error') {
    location.hash = '#/login';
    toast('El enlace expiró o ya fue usado. Pide a Recursos Humanos una nueva invitación o usa "¿Olvidaste tu contraseña?".', 'error');
  } else if (params.has('recuperar')) {
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
