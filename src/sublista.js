// Componente reutilizable: lista de registros relacionados con alta y baja
// (contratos de un empleado, experiencia de un postulante, etc.).
import { urlFirmada } from './api.js';
import { abrirFormulario, confirmar, esc, mostrarError, tabla, toast } from './ui.js';

/**
 * opciones: { titulo, textoNuevo, columnas, cargar(), campos?, valores?, guardar?(datos, form),
 *             eliminar?(fila), puedeEditar, vacio, alMontar?(panel, filas, recargar) }
 */
export async function sublista(panel, opciones) {
  const { titulo, textoNuevo = 'Agregar', columnas, cargar, campos, valores = {}, guardar, eliminar, puedeEditar, vacio, alMontar } = opciones;
  const filas = await cargar();
  const recargar = () => sublista(panel, opciones).catch(mostrarError);

  const cols = [...columnas];
  if (puedeEditar && eliminar) {
    cols.push({
      titulo: '',
      clase: 'derecha',
      render: (f) => `<button type="button" class="pequeno peligro" data-eliminar="${esc(f.id)}">Eliminar</button>`,
    });
  }

  panel.innerHTML = `
    <div class="tarjeta-titulo"><h3>${esc(titulo)}</h3>
      ${puedeEditar && guardar ? `<button type="button" class="pequeno primario" data-nuevo>+ ${esc(textoNuevo)}</button>` : ''}
    </div>
    ${tabla(cols, filas, { vacio })}`;

  panel.querySelector('[data-nuevo]')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: textoNuevo,
      campos,
      valores: typeof valores === 'function' ? valores() : valores,
      alGuardar: async (datos, form) => {
        await guardar(datos, form);
        toast('Registro guardado.');
        recargar();
      },
    }),
  );

  panel.querySelectorAll('[data-eliminar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmar('¿Eliminar este registro?', { textoAceptar: 'Eliminar', peligro: true }))) return;
      try {
        await eliminar(filas.find((f) => f.id === b.dataset.eliminar));
        toast('Registro eliminado.');
        recargar();
      } catch (error) {
        mostrarError(error);
      }
    }),
  );

  alMontar?.(panel, filas, recargar);
}

/** Botón que abre un archivo privado de Storage mediante una URL firmada. */
export const botonArchivo = (bucket, ruta, texto = 'Ver archivo') =>
  ruta
    ? `<button type="button" class="enlace" data-bucket="${esc(bucket)}" data-archivo="${esc(ruta)}">${esc(texto)}</button>`
    : '—';

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-archivo]');
  if (!b) return;
  e.stopPropagation();
  // Se abre la ventana antes del await para que el navegador no la bloquee
  const ventana = window.open('', '_blank');
  try {
    ventana.location = await urlFirmada(b.dataset.bucket, b.dataset.archivo);
  } catch (error) {
    ventana?.close();
    mostrarError(error);
  }
});
