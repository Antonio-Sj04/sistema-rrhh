// Tema visual (claro / oscuro / según el sistema), guardado en localStorage
// para que se conserve entre visitas: persistencia a largo plazo en el cliente.
const CLAVE = 'rrhh:tema';
const TEMAS = ['sistema', 'claro', 'oscuro'];

export function temaGuardado() {
  try {
    const t = localStorage.getItem(CLAVE);
    return TEMAS.includes(t) ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

function aplicar(tema) {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema === 'oscuro' ? 'dark' : 'light');
}

export const aplicarTemaGuardado = () => aplicar(temaGuardado());

/** Guarda y aplica un tema. */
export function fijarTema(tema) {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // sin almacenamiento el tema aplica solo en esta visita
  }
  aplicar(tema);
  document.querySelectorAll('[data-tema-valor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.temaValor === tema)));
}

/** Cambia entre claro y oscuro según lo que se ve ahora (botón de la barra del teléfono). */
export function alternarClaroOscuro() {
  const oscuroAhora = getComputedStyle(document.documentElement).colorScheme === 'dark';
  fijarTema(oscuroAhora ? 'claro' : 'oscuro');
}

const ICONOS = {
  claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sistema: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  oscuro: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const TITULOS = { claro: 'Tema claro', sistema: 'Tema del sistema', oscuro: 'Tema oscuro' };

/** Selector segmentado de tema (claro / sistema / oscuro). */
export function selectorTema() {
  const actual = temaGuardado();
  const botones = ['claro', 'sistema', 'oscuro']
    .map((t) => `<button type="button" data-tema-valor="${t}" aria-pressed="${t === actual}" title="${TITULOS[t]}" aria-label="${TITULOS[t]}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[t]}</svg></button>`)
    .join('');
  return `<div class="selector-tema" role="group" aria-label="Tema de la interfaz">${botones}</div>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tema-valor]');
  if (b) fijarTema(b.dataset.temaValor);
});
