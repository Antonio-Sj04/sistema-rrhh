// Constancias laborales y de ingresos en PDF.
// jsPDF se carga solo cuando se genera una constancia.
import { fechaLarga, quetzalesALetras } from './lib/letras.js';
import { empresa, ok } from './supabase.js';
import { abrirFormulario, hoy, moneda, nombreCompleto, toast } from './ui.js';

export const TIPOS_CONSTANCIA = [
  ['laboral', 'Constancia laboral'],
  ['ingresos', 'Constancia de ingresos'],
];

const MM_POR_PUNTO = 0.3528;
const COLOR_MARCA = [47, 91, 234];
const GRIS = [100, 108, 128];

/**
 * Arma el PDF (sin guardar). Recibe todo ya cargado para poder probarlo aparte.
 * datos: { config, emp, puesto, departamento, tipo, dirigidaA, codigo, fecha, bonificacion }
 */
export function construirPDF(jsPDF, datos) {
  const { config, emp, puesto, departamento, tipo, dirigidaA, codigo, fecha, bonificacion } = datos;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 25;
  const util = ancho - margen * 2;
  let y = 24;

  const parrafo = (texto, { tam = 11.5, estilo = 'normal', alinear = 'justify', interlinea = 1.55, despues = 6 } = {}) => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tam);
    const lineas = doc.splitTextToSize(texto, util);
    const x = { center: ancho / 2, right: ancho - margen }[alinear] ?? margen;
    doc.text(lineas, x, y, { maxWidth: util, align: alinear, lineHeightFactor: interlinea });
    y += lineas.length * tam * MM_POR_PUNTO * interlinea + despues;
  };

  // Encabezado con los datos de la empresa
  doc.setTextColor(20, 24, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(config.nombre, margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  const contacto = [config.nit && `NIT ${config.nit}`, config.direccion, config.telefono && `Tel. ${config.telefono}`, config.correo]
    .filter(Boolean)
    .join('  ·  ');
  if (contacto) {
    const lineas = doc.splitTextToSize(contacto, util);
    doc.text(lineas, margen, y);
    y += lineas.length * 4;
  }
  doc.setDrawColor(...COLOR_MARCA);
  doc.setLineWidth(0.8);
  doc.line(margen, y + 1, ancho - margen, y + 1);
  y += 14;

  doc.setTextColor(20, 24, 36);
  parrafo(`${config.ciudad}, ${fechaLarga(fecha)}`, { alinear: 'right', despues: 12 });

  parrafo(tipo === 'ingresos' ? 'CONSTANCIA DE INGRESOS' : 'CONSTANCIA LABORAL', { tam: 14, estilo: 'bold', alinear: 'center', despues: 10 });
  parrafo(`${(dirigidaA || 'A quien interese').toUpperCase()}:`, { estilo: 'bold', alinear: 'left', despues: 6 });

  const identificacion = emp.dpi ? `, quien se identifica con Documento Personal de Identificación (DPI) número ${emp.dpi}` : '';
  const cargo = [puesto && `el puesto de ${puesto}`, departamento && `en el departamento de ${departamento}`].filter(Boolean).join(' ');
  const activo = emp.estado !== 'baja';
  parrafo(
    `Por este medio, ${config.nombre} hace constar que ${nombreCompleto(emp).toUpperCase()}${identificacion}, ` +
      (activo
        ? `labora en esta empresa desde el ${fechaLarga(emp.fecha_ingreso)}${cargo ? `, desempeñando actualmente ${cargo}` : ''}.`
        : `laboró en esta empresa del ${fechaLarga(emp.fecha_ingreso)} al ${fechaLarga(emp.fecha_baja)}${cargo ? `, desempeñando ${cargo}` : ''}.`),
  );

  if (tipo === 'ingresos') {
    const salario = Number(emp.salario_base);
    const total = salario + Number(bonificacion);
    parrafo(
      `Devenga un salario mensual ordinario de ${moneda(salario)} (${quetzalesALetras(salario)}), más una bonificación ` +
        `incentivo de ${moneda(bonificacion)} (${quetzalesALetras(bonificacion)}) conforme al Decreto 37-2001, ` +
        `para un total mensual de ${moneda(total)} (${quetzalesALetras(total)}), sujeto a los descuentos de ley.`,
    );
  }

  parrafo(
    `Y para los usos que al interesado convengan, se extiende, firma y sella la presente en la ciudad de ${config.ciudad}, ` +
      `el ${fechaLarga(fecha)}.`,
    { despues: 34 },
  );

  // Firma
  doc.setDrawColor(20, 24, 36);
  doc.setLineWidth(0.3);
  doc.line(ancho / 2 - 38, y, ancho / 2 + 38, y);
  y += 6;
  if (config.firmante_nombre) parrafo(config.firmante_nombre, { estilo: 'bold', alinear: 'center', despues: 0 });
  if (config.firmante_cargo) parrafo(config.firmante_cargo, { tam: 10, alinear: 'center', despues: 0 });
  parrafo(config.nombre, { tam: 10, alinear: 'center', despues: 0 });

  // Pie
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`Código de verificación: ${codigo}`, margen, alto - 14);
  doc.text(`Emitida el ${fechaLarga(fecha)}`, ancho - margen, alto - 14, { align: 'right' });
  return doc;
}

/** Carga los datos, registra la constancia y descarga el PDF. */
export async function generarConstancia(emp, tipo, dirigidaA) {
  const [config, parametros, puesto, departamento] = await Promise.all([
    ok(empresa('configuracion').select('*').eq('id', 1).single()),
    ok(empresa('parametros_nomina').select('bonificacion_incentivo').eq('id', 1).single()),
    emp.puesto_id ? ok(empresa('puestos').select('nombre').eq('id', emp.puesto_id).maybeSingle()) : null,
    emp.departamento_id ? ok(empresa('departamentos').select('nombre').eq('id', emp.departamento_id).maybeSingle()) : null,
  ]);
  if (!config.nombre) {
    throw new Error('Primero configura los datos de la empresa en Organización → Datos de la empresa.');
  }
  if (tipo === 'ingresos' && emp.estado === 'baja') {
    throw new Error('La constancia de ingresos solo aplica a empleados activos.');
  }

  // Se carga el generador antes de registrar, para no dejar constancias sin PDF
  let jsPDF;
  try {
    ({ jsPDF } = await import('jspdf'));
  } catch {
    throw new Error('No se pudo descargar el generador de PDF. Revisa tu conexión y vuelve a intentarlo.');
  }
  const [registro] = await ok(
    empresa('constancias').insert({ empleado_id: emp.id, tipo, dirigida_a: dirigidaA || null }).select('codigo, created_at'),
  );
  const doc = construirPDF(jsPDF, {
    config,
    emp,
    puesto: puesto?.nombre,
    departamento: departamento?.nombre,
    tipo,
    dirigidaA,
    codigo: registro.codigo,
    fecha: hoy(),
    bonificacion: parametros.bonificacion_incentivo,
  });
  const nombre = `${tipo === 'ingresos' ? 'Constancia_ingresos' : 'Constancia_laboral'}_${emp.apellidos}_${emp.nombres}`
    .normalize('NFD')
    .replace(/[^\w]+/g, '_');
  doc.save(`${nombre}.pdf`);
}

/** Diálogo para elegir el tipo de constancia y a quién va dirigida. */
export function abrirConstancia(emp) {
  const tipos = emp.estado === 'baja' ? TIPOS_CONSTANCIA.filter(([t]) => t === 'laboral') : TIPOS_CONSTANCIA;
  abrirFormulario({
    titulo: 'Generar constancia',
    textoGuardar: 'Descargar PDF',
    campos: [
      { nombre: 'tipo', etiqueta: 'Tipo de constancia', tipo: 'select', requerido: true, completo: true, opciones: tipos },
      { nombre: 'dirigida_a', etiqueta: 'Dirigida a', completo: true, placeholder: 'A quien interese', ayuda: 'Ej.: Banco Industrial, Embajada de…' },
    ],
    valores: { tipo: 'laboral' },
    alGuardar: async ({ tipo, dirigida_a }) => {
      await generarConstancia(emp, tipo, dirigida_a);
      toast('Constancia generada.');
    },
  });
}
