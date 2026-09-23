// Router SPA basado en hash (#/ruta). Funciona en cualquier hosting estático
// sin configurar reescrituras en el servidor.
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

export const navegar = (ruta) => {
  location.hash = `#${ruta}`;
};

const rutaActual = () => location.hash.replace(/^#/, '').split('?')[0] || '/';

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

let generacion = 0;

async function resolver() {
  const actual = ++generacion;
  const camino = rutaActual();
  const destino = coincidir(camino);
  const sesion = obtenerSesion();
  const perfil = obtenerPerfil();

  if (!destino) return navegar(sesion ? inicioPorRol() : '/login');
  if (destino.abierta) destino.sinLayout = true;
  else if (!destino.publica && !sesion) return navegar('/login');
  if (destino.publica && sesion && perfil) return navegar(inicioPorRol());
  if (!destino.publica && !destino.sinLayout && !perfil) return navegar('/login');
  if (destino.roles && !destino.roles.includes(perfil.rol)) return navegar(inicioPorRol());

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

  try {
    const modulo = await destino.vista();
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
  window.addEventListener('hashchange', resolver);
  resolver();
}

export const recargarVista = resolver;
