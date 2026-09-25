// Aplica el tema guardado antes de pintar la página (evita un destello del
// tema equivocado). Es un archivo externo para cumplir la política CSP.
try {
  var t = localStorage.getItem('rrhh:tema');
  if (t === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark');
  if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light');
} catch (e) {
  /* sin almacenamiento: se usa el tema del sistema */
}
