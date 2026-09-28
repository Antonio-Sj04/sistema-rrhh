import { alCambiarAuth, iniciarAuth, verificarEnlace } from './auth.js';
import { iniciarRouter, navegar, recargarVista } from './router.js';
import { aplicarTemaGuardado } from './tema.js';
import { toast } from './ui.js';

// Enlaces de los correos (invitación, recuperación, cambio de correo):
// /?token_hash=...&type=...  → la API los valida y crea la cookie de sesión
const TIPOS_ENLACE = ['invite', 'recovery', 'email_change', 'signup', 'magiclink'];

async function procesarEnlaceDeCorreo() {
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get('token_hash');
  const tipo = params.get('type');
  if (!tokenHash || !TIPOS_ENLACE.includes(tipo)) return null;
  // Se quita el token de la barra de direcciones antes de usarlo
  history.replaceState(null, '', '/');
  try {
    await verificarEnlace(tokenHash, tipo);
    return tipo;
  } catch {
    return 'error';
  }
}

/** Enlaces antiguos con #/ruta (antes de usar la History API) → /ruta */
function migrarEnlaceConHash() {
  if (location.hash.startsWith('#/')) {
    history.replaceState(null, '', location.hash.slice(1));
  }
}

async function arrancar() {
  aplicarTemaGuardado();
  migrarEnlaceConHash();
  const enlace = await procesarEnlaceDeCorreo();
  await iniciarAuth();

  if (enlace === 'invite' || enlace === 'recovery') {
    history.replaceState(null, '', '/restablecer');
  } else if (enlace === 'email_change') {
    toast('Tu correo fue actualizado.');
  } else if (enlace === 'error') {
    history.replaceState(null, '', '/login');
    toast('El enlace expiró o ya fue usado. Pide a Recursos Humanos una nueva invitación o usa "¿Olvidaste tu contraseña?".', 'error');
  }

  alCambiarAuth((evento) => {
    if (evento === 'SIGNED_OUT') {
      toast('Tu sesión terminó. Inicia sesión de nuevo.', 'error');
      navegar('/login', { reemplazar: true });
    } else {
      recargarVista();
    }
  });

  iniciarRouter();
}

arrancar();
