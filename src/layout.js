import { empresa } from './api.js';
import { cerrarSesion, obtenerPerfil } from './auth.js';
import { navegar } from './router.js';
import { alternarClaroOscuro, selectorTema } from './tema.js';
import { colorAvatar, confirmar, esc, etiqueta, toast } from './ui.js';

const ICONOS = {
  inicio: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  portal: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  empleados: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-4.8-5-5.3"/>',
  organizacion: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>',
  ausencias: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  nomina: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v5M18 10v5"/>',
  vacantes: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  postulantes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  proceso: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/>',
  usuarios: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  auditoria: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  empresa: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>',
};

/** Logo: escudo con check (marca del sistema). */
export const LOGO = `<span class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg></span>`;

export const icono = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[n]}</svg>`;

const MENU = [
  { seccion: 'General' },
  { ruta: '/', texto: 'Inicio', icono: 'inicio', roles: ['admin', 'rrhh', 'nomina', 'jefe'] },
  { ruta: '/mi-portal', texto: 'Mi portal', icono: 'portal', requiereEmpleado: true },
  { seccion: 'Empresa' },
  { ruta: '/empleados', texto: 'Empleados', icono: 'empleados', roles: ['admin', 'rrhh', 'nomina', 'jefe'] },
  { ruta: '/organizacion', texto: 'Organización', icono: 'organizacion', roles: ['admin', 'rrhh'] },
  { ruta: '/ausencias', texto: 'Vacaciones y permisos', icono: 'ausencias', roles: ['admin', 'rrhh', 'nomina', 'jefe'] },
  { ruta: '/nomina', texto: 'Nómina', icono: 'nomina', roles: ['admin', 'rrhh', 'nomina'] },
  { seccion: 'Reclutamiento' },
  { ruta: '/vacantes', texto: 'Vacantes', icono: 'vacantes', roles: ['admin', 'rrhh', 'jefe'] },
  { ruta: '/postulantes', texto: 'Postulantes', icono: 'postulantes', roles: ['admin', 'rrhh', 'jefe'] },
  { ruta: '/proceso', texto: 'Proceso de selección', icono: 'proceso', roles: ['admin', 'rrhh', 'jefe'] },
  { seccion: 'Administración' },
  { ruta: '/usuarios', texto: 'Usuarios y roles', icono: 'usuarios', roles: ['admin'] },
  { ruta: '/auditoria', texto: 'Bitácora', icono: 'auditoria', roles: ['admin'] },
];

const PRIORIDAD_MOVIL = ['/', '/mi-portal', '/empleados', '/ausencias', '/nomina', '/proceso', '/vacantes'];
const CORTOS = { '/ausencias': 'Permisos', '/proceso': 'Selección', '/mi-portal': 'Mi portal' };

function menuVisible(perfil) {
  const items = MENU.filter(
    (m) =>
      m.seccion ||
      ((!m.roles || m.roles.includes(perfil.rol)) && (!m.requiereEmpleado || perfil.empleado_id)),
  );
  // Quita secciones que quedaron vacías
  return items.filter((m, i) => !m.seccion || (items[i + 1] && !items[i + 1].seccion));
}

let shell = null;

/** Monta la estructura (menú lateral + contenido) y devuelve el contenedor de la vista. */
export function montarLayout(app) {
  const perfil = obtenerPerfil();
  if (shell && app.contains(shell) && shell.dataset.usuario === perfil.id) {
    shell.classList.remove('mas-abierto');
    return shell.querySelector('.contenido');
  }

  const visibles = menuVisible(perfil);
  const enlace = (m) => `<a href="${m.ruta}" data-ruta="${m.ruta}">${icono(m.icono)}<span>${m.texto}</span></a>`;
  const enlaces = visibles.map((m) => (m.seccion ? `<div class="menu-seccion">${m.seccion}</div>` : enlace(m))).join('');
  // Teléfono: los 4 accesos más usados en la barra inferior; el resto en "Más"
  const inferiores = PRIORIDAD_MOVIL.map((r) => visibles.find((m) => m.ruta === r)).filter(Boolean).slice(0, 4);
  const restantes = visibles.filter((m) => !m.seccion && !inferiores.includes(m));
  const enlaceCorto = (m) => `<a href="${m.ruta}" data-ruta="${m.ruta}">${icono(m.icono)}<span>${CORTOS[m.ruta] ?? m.texto}</span></a>`;
  const nombre = perfil.nombre ?? perfil.email;
  const iniciales = nombre.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

  app.innerHTML = `<div class="shell" data-usuario="${esc(perfil.id)}">
    <aside class="lateral" aria-label="Menú principal">
      <div class="marca">${LOGO}<div><div class="marca-nombre">Sistema RRHH</div><div class="marca-empresa" data-empresa>Recursos Humanos</div></div></div>
      <nav class="menu">${enlaces}</nav>
      <div class="lateral-pie">
        ${selectorTema()}
        <div class="usuario">
          <span class="avatar" style="${colorAvatar(nombre)}">${esc(iniciales)}</span>
          <div class="usuario-datos"><div class="usuario-nombre">${esc(nombre)}</div><div class="usuario-rol">${esc(etiqueta(perfil.rol))}</div></div>
          <button type="button" class="icono-boton" data-salir title="Cerrar sesión" aria-label="Cerrar sesión">${icono('salir')}</button>
        </div>
        <button type="button" class="salir-todos" data-salir-todos>Cerrar sesión en todos mis dispositivos</button>
      </div>
    </aside>
    <div class="principal">
      <header class="barra-movil">
        <div class="marca">${LOGO}<div><div class="marca-nombre">Sistema RRHH</div><div class="marca-empresa" data-empresa>Recursos Humanos</div></div></div>
        <div class="barra-movil-acciones">
          <button type="button" class="icono-boton redondo" data-tema-rapido aria-label="Cambiar tema claro u oscuro">
            <span class="icono-sol">${icono('sol')}</span><span class="icono-luna">${icono('luna')}</span></button>
          <button type="button" class="avatar-boton" data-abrir-mas aria-label="Mi cuenta" style="${colorAvatar(nombre)}">${esc(iniciales)}</button>
        </div>
      </header>
      <main class="contenido"></main>
    </div>
    <section class="hoja-mas" aria-label="Más opciones">
      <div class="tarjeta hoja-perfil">
        <span class="avatar grande" style="${colorAvatar(nombre)}">${esc(iniciales)}</span>
        <div><div class="persona-nombre">${esc(nombre)}</div><div class="texto-suave">${esc(etiqueta(perfil.rol))} · <span data-empresa>Recursos Humanos</span></div></div>
      </div>
      ${restantes.length ? `<nav class="tarjeta hoja-lista">${restantes.map((m) => `<a href="${m.ruta}" data-ruta="${m.ruta}">
        <span class="kpi-icono tono-indigo">${icono(m.icono)}</span><span>${m.texto}</span>${icono('flecha')}</a>`).join('')}</nav>` : ''}
      <div class="tarjeta hoja-fila"><span>Tema</span>${selectorTema()}</div>
      <div class="tarjeta hoja-lista">
        <button type="button" class="hoja-salir" data-salir><span class="kpi-icono tono-rosa">${icono('salir')}</span><span>Cerrar sesión</span></button>
        <button type="button" class="hoja-salir" data-salir-todos><span class="kpi-icono tono-rosa">${icono('salir')}</span><span>Cerrar sesión en todos mis dispositivos</span></button>
      </div>
    </section>
    <nav class="nav-inferior" aria-label="Accesos rápidos">
      ${inferiores.map(enlaceCorto).join('')}
      <button type="button" id="btn-menu" data-abrir-mas aria-label="Más opciones">${icono('mas')}<span>Más</span></button>
    </nav>
  </div>`;

  // Nombre de la empresa (dato no crítico: si falla se deja el texto genérico)
  empresa('configuracion').select('nombre').eq('id', 1).maybeSingle().then(({ data }) => {
    if (data?.nombre) app.querySelectorAll('[data-empresa]').forEach((e) => (e.textContent = data.nombre));
  });

  shell = app.querySelector('.shell');
  const salir = async (todos) => {
    if (todos && !(await confirmar('Se cerrará tu sesión aquí y en tus otros dispositivos (computadora, teléfono). En los otros puede tardar hasta una hora en surtir efecto. ¿Continuar?', { textoAceptar: 'Cerrar en todos' }))) return;
    await cerrarSesion(todos);
    toast(todos ? 'Sesión cerrada en todos tus dispositivos.' : 'Sesión cerrada.');
    navegar('/login', { reemplazar: true });
  };
  shell.querySelectorAll('[data-salir]').forEach((b) => b.addEventListener('click', () => salir(false)));
  shell.querySelectorAll('[data-salir-todos]').forEach((b) => b.addEventListener('click', () => salir(true)));
  // Teléfono: "Más" (o el avatar) abre la hoja con el resto de opciones
  shell.querySelectorAll('[data-abrir-mas]').forEach((b) => b.addEventListener('click', () => shell.classList.toggle('mas-abierto')));
  shell.querySelector('.hoja-mas').addEventListener('click', (e) => {
    if (e.target.closest('a')) shell.classList.remove('mas-abierto');
  });
  shell.querySelectorAll('.nav-inferior a').forEach((a) => a.addEventListener('click', () => shell.classList.remove('mas-abierto')));
  shell.querySelector('[data-tema-rapido]').addEventListener('click', alternarClaroOscuro);
  return shell.querySelector('.contenido');
}

export function marcarActivo(camino) {
  const base = `/${camino.split('/')[1] ?? ''}`;
  document.querySelectorAll('.menu a, .nav-inferior a, .hoja-lista a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === base));
}
