// Router SPA con la History API: URLs limpias (/empleados/123), navegación con
// pushState/replaceState y el evento popstate para los botones Atrás/Adelante,
// sin recargar la página. El servidor (netlify.toml) sirve index.html en
// cualquier ruta para que las URLs se puedan abrir o recargar directamente.
import { inicioPorRol, obtenerPerfil, obtenerSesion } from './auth.js';
import { montarLayout, marcarActivo } from './layout.js';
import { cargando, esc, mensajeError } from './ui.js';

const GESTION = ['admin', 'rrhh', 'nomina', 'jefe'];

export const RUTAS = [
  { ruta: '/login', vista: () => import('./views/login.js'), publica: true },
  // Portal de empleo: abierto a cualquiera, con o sin sesión
  { ruta: '/empleos', vista: () => import('./views/empleos.js'), abierta: true },
  { ruta: '/restablecer', vista: () => import('./views/restablecer.js'), sinLayout: true },
  { ruta: '/', vista: () => import('./views/dashboard.js'), roles: GESTION },
  { ruta: '/mi-portal', vista: () => import('./views/mi-portal.js') },
  { ruta: '/empleados', vista: () => import('./views/empleados.js'), roles: GESTION },
  { ruta: '/empleados/:id', vista: () => import('./views/empleado.js'), roles: GESTION },
  { ruta: '/organizacion', vista: () => import('./views/organizacion.js'), roles: ['admin', 'rrhh'] },
  { ruta: '/ausencias', vista: () => import('./views/ausencias.js'), roles: GESTION },
  { ruta: '/nomina', vista: () => import('./views/nomina.js'), roles: ['admin', 'rrhh', 'nomina'] },
  { ruta: '/nomina/:id', vista: () => import('./views/periodo.js'), roles: ['admin', 'rrhh', 'nomina'] },
  { ruta: '/vacantes', vista: () => import('./views/vacantes.js'), roles: ['admin', 'rrhh', 'jefe'] },
  { ruta: '/postulantes', vista: () => import('./views/postulantes.js'), roles: ['admin', 'rrhh', 'jefe'] },
  { ruta: '/postulantes/:id', vista: () => import('./views/postulante.js'), roles: ['admin', 'rrhh', 'jefe'] },
  { ruta: '/proceso', vista: () => import('./views/proceso.js'), roles: ['admin', 'rrhh', 'jefe'] },
  { ruta: '/usuarios', vista: () => import('./views/usuarios.js'), roles: ['admin'] },
  { ruta: '/auditoria', vista: () => import('./views/auditoria.js'), roles: ['admin'] },
];

/**
 * Navega sin recargar: agrega una entrada al historial (pushState) o, con
 * reemplazar, sustituye la actual (replaceState; p. ej. en redirecciones).
 */
export function navegar(ruta, { reemplazar = false, estado = {} } = {}) {
  const destino = new URL(ruta, location.origin);
  const actual = location.pathname + location.search;
  if (destino.pathname + destino.search !== actual) {
    history[reemplazar ? 'replaceState' : 'pushState'](estado, '', destino.pathname + destino.search + destino.hash);
  }
  resolver();
}

const rutaActual = () => location.pathname.replace(/\/+$/, '') || '/';

/** Intercepta los clics en enlaces internos para navegar sin recargar. */
function interceptarEnlaces(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.preventDefault();
  navegar(url.pathname + url.search);
}

function coincidir(camino) {
  for (const r of RUTAS) {
    const nombres = [];
    const patron = new RegExp(
      `^${r.ruta.replace(/:(\w+)/g, (_, n) => (nombres.push(n), '([^/]+)'))}$`,
    );
    const m = camino.match(patron);
    if (m) return { ...r, params: Object.fromEntries(nombres.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const CLAVE_RECARGA = 'rrhh:recarga-por-error';

function recargarUnaVez() {
  try {
    if (sessionStorage.getItem(CLAVE_RECARGA)) return false;
    sessionStorage.setItem(CLAVE_RECARGA, '1');
  } catch {
    return false;
  }
  location.reload();
  return true;
}

function olvidarRecarga() {
  try {
    sessionStorage.removeItem(CLAVE_RECARGA);
  } catch {
    // sin almacenamiento disponible no hay nada que limpiar
  }
}

// Vite avisa con este evento cuando falla la precarga de un archivo de la app
window.addEventListener('vite:preloadError', (e) => {
  if (recargarUnaVez()) e.preventDefault();
});

let generacion = 0;

async function resolver() {
  const actual = ++generacion;
  const camino = rutaActual();
  const destino = coincidir(camino);
  const sesion = obtenerSesion();
  const perfil = obtenerPerfil();

  const redirigir = (ruta) => navegar(ruta, { reemplazar: true });
  if (!destino) return redirigir(sesion ? inicioPorRol() : '/login');
  if (destino.abierta) destino.sinLayout = true;
  else if (!destino.publica && !sesion) return redirigir('/login');
  if (destino.publica && sesion && perfil) return redirigir(inicioPorRol());
  if (!destino.publica && !destino.sinLayout && !perfil) return redirigir('/login');
  if (destino.roles && !destino.roles.includes(perfil.rol)) return redirigir(inicioPorRol());

  const app = document.getElementById('app');
  let contenedor;
  if (destino.publica || destino.sinLayout) {
    app.innerHTML = '';
    contenedor = app;
  } else {
    contenedor = montarLayout(app);
    marcarActivo(camino);
  }
  // Cada vista recibe un elemento nuevo para que sus eventos no se acumulen
  const vista = document.createElement('div');
  vista.innerHTML = cargando();
  contenedor.replaceChildren(vista);
  contenedor = vista;

  let modulo;
  try {
    modulo = await destino.vista();
  } catch (error) {
    // Falla momentánea al descargar el código de la pantalla (p. ej. error del
    // servidor de hosting): se recarga la página una sola vez para reintentar
    if (recargarUnaVez()) return;
    console.error(error);
    contenedor.innerHTML = `<div class="tarjeta"><div class="vacio">
      <h2>No se pudo cargar esta sección</h2><p>Revisa tu conexión a internet.</p>
      <button type="button" class="primario" data-reintentar>Reintentar</button></div></div>`;
    contenedor.querySelector('[data-reintentar]').addEventListener('click', () => location.reload());
    return;
  }
  olvidarRecarga();

  try {
    if (actual !== generacion) return; // el usuario ya navegó a otra ruta
    await modulo.render(contenedor, destino.params);
  } catch (error) {
    console.error(error);
    if (actual === generacion) {
      contenedor.innerHTML = `<div class="tarjeta"><div class="vacio">
        <h2>No se pudo cargar esta sección</h2><p>${esc(mensajeError(error))}</p></div></div>`;
    }
  }
}

export function iniciarRouter() {
  window.addEventListener('popstate', resolver); // botones Atrás/Adelante del navegador
  document.addEventListener('click', interceptarEnlaces);
  resolver();
}

export const recargarVista = resolver;
