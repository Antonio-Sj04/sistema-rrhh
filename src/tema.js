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

/** Pasa al siguiente tema (sistema → claro → oscuro) y lo guarda. */
export function alternarTema() {
  const siguiente = TEMAS[(TEMAS.indexOf(temaGuardado()) + 1) % TEMAS.length];
  try {
    localStorage.setItem(CLAVE, siguiente);
  } catch {
    // sin almacenamiento el tema aplica solo en esta visita
  }
  aplicar(siguiente);
  return siguiente;
}

export const etiquetaTema = (t = temaGuardado()) => ({ sistema: '🖥 Tema: sistema', claro: '☀ Tema: claro', oscuro: '🌙 Tema: oscuro' })[t];

/** Botón que alterna el tema y actualiza su propio texto. */
export function botonTema(clase = 'pequeno') {
  return `<button type="button" class="${clase}" data-tema title="Cambiar tema (se guarda en este navegador)">${etiquetaTema()}</button>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tema]');
  if (!b) return;
  const tema = alternarTema();
  document.querySelectorAll('[data-tema]').forEach((x) => (x.textContent = etiquetaTema(tema)));
});
