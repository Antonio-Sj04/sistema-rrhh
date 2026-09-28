// Gráficas SVG ligeras: columnas, columnas agrupadas y barras horizontales.
// Cada gráfica tiene tooltip al pasar el cursor o enfocar con teclado, y una
// vista de tabla equivalente para accesibilidad.
import { esc } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const ALTO_PLOT = 200;
const ALTO_EJE_X = 28;
const GROSOR_MAX = 24;
const RADIO = 4;

const compacto = new Intl.NumberFormat('es-GT', { notation: 'compact', maximumFractionDigits: 1 });

/** Divisiones "redondas" del eje: 0, 1,000, 2,000… */
function divisiones(max, cantidad = 4) {
  if (max <= 0) return [0, 1];
  const bruto = max / cantidad;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto);
  const tope = Math.ceil(max / paso) * paso;
  const lista = [];
  for (let v = 0; v <= tope + paso / 2; v += paso) lista.push(v);
  return lista;
}

let contadorGraficas = 0;

/** Columna con extremo de datos redondeado y base recta. */
function columna(x, y, w, h) {
  const r = Math.min(RADIO, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Barra horizontal con extremo derecho redondeado. */
function barra(x, y, w, h) {
  const r = Math.min(RADIO, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function crearTooltip(contenedor) {
  const tip = document.createElement('div');
  tip.className = 'viz-tooltip';
  tip.hidden = true;
  contenedor.append(tip);
  return {
    mostrar(html, x, y) {
      tip.innerHTML = html;
      tip.hidden = false;
      const maxX = contenedor.clientWidth - tip.offsetWidth - 4;
      tip.style.left = `${Math.max(4, Math.min(x - tip.offsetWidth / 2, maxX))}px`;
      tip.style.top = `${Math.max(0, y - tip.offsetHeight - 10)}px`;
    },
    ocultar() {
      tip.hidden = true;
    },
  };
}

/** Enlaza hover y foco de las zonas [data-i] con el tooltip. */
function enlazarTooltip(contenedor, svg, contenido) {
  const tip = crearTooltip(contenedor);
  const mostrar = (zona) => {
    const i = Number(zona.dataset.i);
    const caja = zona.getBoundingClientRect();
    const base = contenedor.getBoundingClientRect();
    svg.querySelectorAll('[data-marca]').forEach((m) => m.classList.toggle('atenuada', Number(m.dataset.marca) !== i));
    tip.mostrar(contenido(i), caja.left - base.left + caja.width / 2, Number(zona.dataset.tope ?? caja.top - base.top));
  };
  const ocultar = () => {
    svg.querySelectorAll('.atenuada').forEach((m) => m.classList.remove('atenuada'));
    tip.ocultar();
  };
  svg.querySelectorAll('[data-i]').forEach((zona) => {
    zona.addEventListener('pointerenter', () => mostrar(zona));
    zona.addEventListener('focus', () => mostrar(zona));
    zona.addEventListener('pointerleave', ocultar);
    zona.addEventListener('blur', ocultar);
  });
}

function svgBase(ancho, alto, titulo) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.setAttribute('width', ancho);
  svg.setAttribute('height', alto);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', titulo);
  return svg;
}

const filaTip = (color, nombre, valor) =>
  `<div class="viz-tooltip-fila"><span class="viz-clave" style="background:var(${color})"></span>${esc(nombre)}<strong>${esc(valor)}</strong></div>`;

/**
 * Columnas verticales, una o varias series.
 * datos: { categorias: [texto], series: [{ nombre, valores: [número], color: '--viz-serie-1' }] }
 * Solo se rotula el valor de la última categoría de la primera serie.
 */
function dibujarColumnas(contenedor, { titulo, categorias, series, formato = String }) {
  const ancho = Math.max(contenedor.clientWidth, 280);
  const izq = 48;
  const der = 8;
  const arriba = 22;
  const plotAncho = ancho - izq - der;
  const max = Math.max(0, ...series.flatMap((s) => s.valores));
  const ticks = divisiones(max);
  const tope = ticks.at(-1);
  const y = (v) => arriba + ALTO_PLOT - (v / tope) * ALTO_PLOT;
  const banda = plotAncho / categorias.length;
  const grosor = Math.min(GROSOR_MAX, ((banda * 0.7) - (series.length - 1) * 2) / series.length);
  const grupo = grosor * series.length + (series.length - 1) * 2;
  // Omite etiquetas del eje X si no caben
  const salto = Math.ceil(categorias.length / Math.max(1, Math.floor(plotAncho / 44)));

  // Degradado vertical por serie (color pleno arriba, más suave en la base)
  const idGrafica = `g${(contadorGraficas += 1)}`;
  let html = `<defs>${series.map((s, j) => `<linearGradient id="${idGrafica}-${j}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(${s.color})"/><stop offset="1" style="stop-color:var(${s.color});stop-opacity:0.55"/></linearGradient>`).join('')}</defs>`;
  for (const t of ticks) {
    html += `<line class="viz-grid${t === 0 ? ' viz-base' : ''}" x1="${izq}" x2="${ancho - der}" y1="${y(t)}" y2="${y(t)}"/>`;
    html += `<text class="viz-eje" x="${izq - 8}" y="${y(t) + 4}" text-anchor="end">${esc(compacto.format(t))}</text>`;
  }
  categorias.forEach((cat, i) => {
    const x0 = izq + banda * i + (banda - grupo) / 2;
    series.forEach((s, j) => {
      const v = s.valores[i];
      if (v > 0) {
        const alto = Math.max(1, (v / tope) * ALTO_PLOT);
        html += `<path data-marca="${i}" fill="url(#${idGrafica}-${j})" d="${columna(x0 + j * (grosor + 2), y(0) - alto, grosor, alto)}"/>`;
      }
    });
    // Se cuenta desde el final para que el mes más reciente siempre tenga etiqueta
    if ((categorias.length - 1 - i) % salto === 0) {
      html += `<text class="viz-eje" x="${izq + banda * i + banda / 2}" y="${arriba + ALTO_PLOT + 18}" text-anchor="middle">${esc(cat)}</text>`;
    }
  });
  // Rótulo directo: último valor de la serie principal
  const ultimo = categorias.length - 1;
  const vUlt = series[0].valores[ultimo];
  if (series.length === 1 && vUlt > 0) {
    html += `<text class="viz-valor" x="${izq + banda * ultimo + banda / 2}" y="${y(vUlt) - 6}" text-anchor="middle">${esc(formato(vUlt))}</text>`;
  }
  // Zonas de interacción: toda la banda, no solo la columna
  categorias.forEach((_, i) => {
    html += `<rect class="viz-zona" data-i="${i}" tabindex="0" x="${izq + banda * i}" y="${arriba}" width="${banda}" height="${ALTO_PLOT}"/>`;
  });

  const svg = svgBase(ancho, arriba + ALTO_PLOT + ALTO_EJE_X, titulo);
  svg.innerHTML = html;
  contenedor.append(svg);
  enlazarTooltip(contenedor, svg, (i) =>
    `<div class="viz-tooltip-titulo">${esc(categorias[i])}</div>` +
    series.map((s) => filaTip(s.color, s.nombre, formato(s.valores[i]))).join(''),
  );
}

/** Barras horizontales de una serie, con el valor en la punta de cada barra. */
function dibujarBarras(contenedor, { titulo, categorias, valores, formato = String, color = '--viz-serie-1' }) {
  const ancho = Math.max(contenedor.clientWidth, 280);
  const etiquetas = Math.min(150, ancho * 0.36);
  const espacioValor = 64;
  const plotAncho = ancho - etiquetas - espacioValor - 8;
  const fila = 34;
  const grosor = 18;
  const max = Math.max(1, ...valores);
  const alto = categorias.length * fila;

  let html = `<line class="viz-grid viz-base" x1="${etiquetas}" x2="${etiquetas}" y1="0" y2="${alto}"/>`;
  categorias.forEach((cat, i) => {
    const y0 = i * fila + (fila - grosor) / 2;
    const w = (valores[i] / max) * plotAncho;
    html += `<text class="viz-etiqueta" x="${etiquetas - 10}" y="${y0 + grosor / 2 + 4}" text-anchor="end">${esc(cat.length > 22 ? `${cat.slice(0, 21)}…` : cat)}</text>`;
    if (valores[i] > 0) html += `<path data-marca="${i}" fill="var(${color})" d="${barra(etiquetas, y0, Math.max(w, 2), grosor)}"/>`;
    html += `<text class="viz-valor" x="${etiquetas + w + 8}" y="${y0 + grosor / 2 + 4}">${esc(formato(valores[i]))}</text>`;
    html += `<rect class="viz-zona" data-i="${i}" data-tope="${y0}" tabindex="0" x="0" y="${i * fila}" width="${ancho}" height="${fila}"/>`;
  });

  const svg = svgBase(ancho, alto, titulo);
  svg.innerHTML = html;
  contenedor.append(svg);
  enlazarTooltip(contenedor, svg, (i) => `<div class="viz-tooltip-titulo">${esc(categorias[i])}</div>${filaTip(color, titulo, formato(valores[i]))}`);
}

function tablaDatos(categorias, series, formato) {
  return `<div class="tabla-contenedor"><table><thead><tr><th></th>${series.map((s) => `<th class="numero">${esc(s.nombre)}</th>`).join('')}</tr></thead>
    <tbody>${categorias.map((c, i) => `<tr><td>${esc(c)}</td>${series.map((s) => `<td class="numero">${esc(formato(s.valores[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/**
 * Tarjeta con título, leyenda (si hay 2+ series), gráfica y botón para ver la tabla.
 * config.tipo: 'columnas' | 'barras'
 */
export function tarjetaGrafica(tarjeta, config) {
  const { titulo, subtitulo = '', categorias, formato = String, vacio = 'Sin datos todavía.' } = config;
  const series = config.series ?? [{ nombre: titulo, valores: config.valores, color: config.color ?? '--viz-serie-1' }];
  const sinDatos = !categorias.length || series.every((s) => s.valores.every((v) => !v));

  tarjeta.innerHTML = `
    <div class="tarjeta-titulo">
      <div><h2>${esc(titulo)}</h2>${subtitulo ? `<div class="texto-suave">${esc(subtitulo)}</div>` : ''}</div>
      ${sinDatos ? '' : '<button type="button" class="pequeno" data-vista>Ver tabla</button>'}
    </div>
    <div class="tarjeta-cuerpo">
      ${series.length > 1 && !sinDatos ? `<div class="viz-leyenda">${series.map((s) => `<span><span class="viz-clave" style="background:var(${s.color})"></span>${esc(s.nombre)}</span>`).join('')}</div>` : ''}
      <div class="viz-lienzo"></div>
    </div>`;

  const lienzo = tarjeta.querySelector('.viz-lienzo');
  if (sinDatos) {
    lienzo.innerHTML = `<div class="vacio">${esc(vacio)}</div>`;
    return;
  }

  let enTabla = false;
  const pintar = () => {
    lienzo.replaceChildren();
    if (enTabla) {
      lienzo.innerHTML = tablaDatos(categorias, series, formato);
    } else if (config.tipo === 'barras') {
      dibujarBarras(lienzo, { titulo, categorias, valores: series[0].valores, formato, color: series[0].color });
    } else {
      dibujarColumnas(lienzo, { titulo, categorias, series, formato });
    }
  };

  tarjeta.querySelector('[data-vista]').addEventListener('click', (e) => {
    enTabla = !enTabla;
    e.target.textContent = enTabla ? 'Ver gráfica' : 'Ver tabla';
    pintar();
  });

  // Dibuja ya y redibuja al cambiar el ancho (menú móvil, rotación de pantalla, etc.)
  let anchoPrevio = lienzo.clientWidth;
  pintar();
  new ResizeObserver(() => {
    if (!tarjeta.isConnected || lienzo.clientWidth === anchoPrevio) return;
    anchoPrevio = lienzo.clientWidth;
    pintar();
  }).observe(lienzo);
}
