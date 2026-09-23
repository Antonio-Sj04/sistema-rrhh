// Utilidades de interfaz compartidas por todas las vistas.

/** Escapa texto para insertarlo de forma segura en HTML. */
export function esc(valor) {
  return String(valor ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

const formatoQ = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
export const moneda = (n) => formatoQ.format(Number(n) || 0);

export function fecha(valor, conHora = false) {
  if (!valor) return '—';
  const d = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
  return conHora
    ? d.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const hoy = () => new Date().toLocaleDateString('en-CA');

export const etiqueta = (v) => {
  const t = String(v ?? '').replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const nombreCompleto = (p) => (p ? `${p.nombres} ${p.apellidos}` : '—');

export const iniciales = (p) => `${p?.nombres?.[0] ?? ''}${p?.apellidos?.[0] ?? ''}`.toUpperCase();

export function persona(p, detalle = '') {
  return `<div class="persona"><span class="avatar">${esc(iniciales(p))}</span>
    <div><div>${esc(nombreCompleto(p))}</div>${detalle ? `<div class="texto-suave">${esc(detalle)}</div>` : ''}</div></div>`;
}

const COLORES_ESTADO = {
  activo: 'exito', aprobada: 'exito', abierta: 'exito', contratado: 'exito', cerrada: 'neutro',
  sin_registro: 'exito', realizada: 'exito',
  pendiente: 'alerta', borrador: 'alerta', pausada: 'alerta', suspendido: 'alerta', programada: 'info',
  calculada: 'info', entrevista: 'info', pruebas: 'info', oferta: 'info', filtro: 'info', aplicado: 'neutro',
  baja: 'peligro', rechazada: 'peligro', rechazado: 'peligro', con_registro: 'peligro', cancelada: 'peligro',
};

export function badge(valor, texto) {
  const color = COLORES_ESTADO[valor] ?? 'neutro';
  return `<span class="badge badge-${color}">${esc(texto ?? etiqueta(valor))}</span>`;
}

export const estrellas = (n) => (n ? `<span class="estrellas">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>` : '—');

export const cargando = () => '<div class="cargando"><div class="spinner"></div></div>';

// ---------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------
export function toast(mensaje, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = mensaje;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}

const MENSAJES = [
  [/Invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/Email not confirmed/i, 'Debes confirmar tu correo antes de ingresar.'],
  [/duplicate key.*dpi/i, 'Ya existe un registro con ese DPI.'],
  [/duplicate key/i, 'Ya existe un registro con esos datos.'],
  [/violates foreign key/i, 'No se puede eliminar: hay registros que dependen de este.'],
  [/violates check constraint.*dpi/i, 'El DPI debe tener 13 dígitos.'],
  [/violates check constraint/i, 'Algún dato no tiene un valor válido.'],
  [/row-level security|permission denied/i, 'No tienes permiso para realizar esta acción.'],
  [/Failed to fetch/i, 'No hay conexión con el servidor.'],
  [/Password should (be|contain)|weak password/i, 'La contraseña debe tener mínimo 8 caracteres, con al menos una mayúscula, una minúscula y un número.'],
  [/should be different from the old/i, 'La nueva contraseña debe ser distinta de la anterior.'],
];

export function mensajeError(error) {
  const texto = error?.message ?? String(error);
  return MENSAJES.find(([re]) => re.test(texto))?.[1] ?? texto;
}

export function mostrarError(error) {
  console.error(error);
  toast(mensajeError(error), 'error');
}

// ---------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------
/**
 * columnas: [{ titulo, campo?, render?(fila), clase? }]
 * opciones.clicable: agrega data-id a cada fila para navegar.
 */
export function tabla(columnas, filas, { vacio = 'No hay registros.', clicable = false, pie = '' } = {}) {
  if (!filas.length) return `<div class="vacio">${esc(vacio)}</div>`;
  const cabecera = columnas.map((c) => `<th class="${c.clase ?? ''}">${esc(c.titulo)}</th>`).join('');
  const cuerpo = filas
    .map((f) => {
      const celdas = columnas
        .map((c) => `<td class="${c.clase ?? ''}">${c.render ? c.render(f) : esc(f[c.campo] ?? '—')}</td>`)
        .join('');
      return `<tr ${clicable ? `class="clicable" data-id="${esc(f.id)}"` : ''}>${celdas}</tr>`;
    })
    .join('');
  return `<div class="tabla-contenedor"><table><thead><tr>${cabecera}</tr></thead>
    <tbody>${cuerpo}</tbody>${pie ? `<tfoot>${pie}</tfoot>` : ''}</table></div>`;
}

// ---------------------------------------------------------------------
// Formularios declarativos
// ---------------------------------------------------------------------
/**
 * campo: { nombre, etiqueta, tipo?, opciones?: [[valor, texto]], requerido?, completo?,
 *          paso?, min?, max?, patron?, ayuda?, acepta? }
 */
export function campoHTML(c, valor) {
  const id = `f_${c.nombre}`;
  const req = c.requerido ? 'required' : '';
  const lbl = `<label for="${id}">${esc(c.etiqueta)}${c.requerido ? ' <span class="requerido">*</span>' : ''}</label>`;
  const v = valor ?? c.defecto ?? '';
  let control;

  switch (c.tipo) {
    case 'select':
      control = `<select id="${id}" name="${c.nombre}" ${req}>
        ${c.requerido ? '' : '<option value="">— Seleccionar —</option>'}
        ${c.opciones.map(([val, txt]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(txt)}</option>`).join('')}
      </select>`;
      break;
    case 'textarea':
      control = `<textarea id="${id}" name="${c.nombre}" ${req}>${esc(v)}</textarea>`;
      break;
    case 'checkbox':
      return `<div class="campo campo-check ${c.completo ? 'completo' : ''}">
        <input type="checkbox" id="${id}" name="${c.nombre}" ${v ? 'checked' : ''} />${lbl}</div>`;
    case 'file':
      control = `<input type="file" id="${id}" name="${c.nombre}" accept="${c.acepta ?? '.pdf,.jpg,.jpeg,.png'}" ${req} />`;
      break;
    default: {
      const valorInput = c.tipo === 'datetime-local' && v ? String(v).slice(0, 16) : v;
      control = `<input type="${c.tipo ?? 'text'}" id="${id}" name="${c.nombre}" value="${esc(valorInput)}" ${req}
        ${c.paso ? `step="${c.paso}"` : ''} ${c.min != null ? `min="${c.min}"` : ''} ${c.max != null ? `max="${c.max}"` : ''}
        ${c.patron ? `pattern="${c.patron}"` : ''} ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : ''} />`;
    }
  }
  const ayuda = c.ayuda ? `<small class="texto-suave">${esc(c.ayuda)}</small>` : '';
  return `<div class="campo ${c.completo || c.tipo === 'textarea' ? 'completo' : ''}">${lbl}${control}${ayuda}</div>`;
}

export const formularioHTML = (campos, valores = {}) =>
  `<div class="formulario">${campos.map((c) => campoHTML(c, valores[c.nombre])).join('')}</div>`;

/** Convierte el formulario en objeto: '' → null, números → Number, checkbox → boolean. */
export function leerFormulario(form, campos) {
  const datos = {};
  for (const c of campos) {
    const el = form.elements[c.nombre];
    if (!el || c.tipo === 'file') continue;
    if (c.tipo === 'checkbox') datos[c.nombre] = el.checked;
    else if (el.value.trim() === '') datos[c.nombre] = null;
    else if (c.tipo === 'number') datos[c.nombre] = Number(el.value);
    else if (c.tipo === 'datetime-local') datos[c.nombre] = new Date(el.value).toISOString();
    else datos[c.nombre] = el.value.trim();
  }
  return datos;
}

// ---------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------
export function modal({ titulo, contenido, pie = '', estrecho = false }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal ${estrecho ? 'estrecho' : ''}" role="dialog" aria-modal="true">
    <div class="modal-cabecera"><h2>${esc(titulo)}</h2><button type="button" data-cerrar aria-label="Cerrar">×</button></div>
    <div class="modal-cuerpo">${contenido}</div>
    ${pie ? `<div class="modal-pie">${pie}</div>` : ''}
  </div>`;
  const alTeclear = (e) => e.key === 'Escape' && cerrar();
  const cerrar = () => {
    fondo.remove();
    document.removeEventListener('keydown', alTeclear);
  };
  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar();
  });
  document.addEventListener('keydown', alTeclear);
  document.body.append(fondo);
  return { el: fondo, cerrar };
}

/**
 * Abre un formulario en un modal. alGuardar(datos, form) puede lanzar errores,
 * que se muestran dentro del modal. Si termina bien, el modal se cierra.
 */
export function abrirFormulario({ titulo, campos, valores = {}, textoGuardar = 'Guardar', alGuardar, extra = '' }) {
  const { el, cerrar } = modal({
    titulo,
    contenido: `<form id="form-modal" novalidate>${formularioHTML(campos, valores)}${extra}</form>`,
    pie: `<button type="button" data-cerrar>Cancelar</button>
          <button type="submit" form="form-modal" class="primario">${esc(textoGuardar)}</button>`,
  });
  const form = el.querySelector('form');
  const boton = el.querySelector('button[type=submit]');
  form.querySelector('input, select, textarea')?.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelector('.error-formulario')?.remove();
    if (!form.reportValidity()) return;
    boton.disabled = true;
    try {
      await alGuardar(leerFormulario(form, campos), form);
      cerrar();
    } catch (error) {
      console.error(error);
      form.firstElementChild.insertAdjacentHTML('afterbegin', `<div class="error-formulario">${esc(mensajeError(error))}</div>`);
    } finally {
      boton.disabled = false;
    }
  });
  return { el, cerrar };
}

export function confirmar(mensaje, { textoAceptar = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolver) => {
    const { el, cerrar } = modal({
      titulo: 'Confirmar',
      estrecho: true,
      contenido: `<p>${esc(mensaje)}</p>`,
      pie: `<button type="button" data-cerrar>Cancelar</button>
            <button type="button" class="${peligro ? 'primario peligro-fondo' : 'primario'}" data-aceptar>${esc(textoAceptar)}</button>`,
    });
    let aceptado = false;
    el.querySelector('[data-aceptar]').addEventListener('click', () => {
      aceptado = true;
      cerrar();
    });
    new MutationObserver((_, obs) => {
      if (!el.isConnected) {
        obs.disconnect();
        resolver(aceptado);
      }
    }).observe(document.body, { childList: true });
  });
}

// ---------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------
/** pestanas: [{ id, titulo, render(contenedor) }] */
export function montarPestanas(contenedor, pestanas, inicial = pestanas[0].id) {
  contenedor.innerHTML = `<div class="pestanas">${pestanas
    .map((p) => `<button type="button" data-pestana="${p.id}">${esc(p.titulo)}</button>`)
    .join('')}</div><div class="panel-pestana"></div>`;

  async function activar(id) {
    contenedor.querySelectorAll('[data-pestana]').forEach((b) => b.classList.toggle('activa', b.dataset.pestana === id));
    // Panel nuevo en cada activación para no acumular eventos
    const panel = document.createElement('div');
    panel.className = 'panel-pestana';
    panel.innerHTML = cargando();
    contenedor.querySelector('.panel-pestana').replaceWith(panel);
    try {
      await pestanas.find((p) => p.id === id).render(panel);
    } catch (error) {
      panel.innerHTML = `<div class="vacio">${esc(mensajeError(error))}</div>`;
    }
  }
  contenedor.querySelector('.pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pestana]');
    if (b) activar(b.dataset.pestana);
  });
  activar(inicial);
  return { recargar: () => activar(contenedor.querySelector('.activa')?.dataset.pestana ?? inicial) };
}

// ---------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------
export function descargarCSV(nombreArchivo, columnas, filas) {
  const celda = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lineas = [
    columnas.map((c) => celda(c.titulo)).join(','),
    ...filas.map((f) => columnas.map((c) => celda(c.valor ? c.valor(f) : f[c.campo])).join(',')),
  ];
  // BOM para que Excel reconozca los acentos
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nombreArchivo });
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Opciones [[id, nombre]] para selects a partir de una lista. */
export const opciones = (lista, texto = (x) => x.nombre) => lista.map((x) => [x.id, texto(x)]);

/** Convierte un arreglo en mapa por id. */
export const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
