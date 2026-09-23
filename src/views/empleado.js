import { obtenerSesion, tieneRol } from '../auth.js';
import { TIPOS_AUSENCIA, camposEmpleado, cargarCatalogos } from '../catalogos.js';
import { recargarVista } from '../router.js';
import { botonArchivo, sublista } from '../sublista.js';
import { empresa, ok, subirArchivo, supabase } from '../supabase.js';
import {
  abrirFormulario, badge, esc, estrellas, etiqueta, fecha, hoy, iniciales, moneda, montarPestanas,
  nombreCompleto, porId,
} from '../ui.js';

export async function render(el, { id }) {
  const puedeEditar = tieneRol('admin', 'rrhh');
  const verNomina = tieneRol('admin', 'rrhh', 'nomina');
  const esJefe = tieneRol('jefe');

  const [emp, catalogos] = await Promise.all([
    ok(empresa('empleados').select('*').eq('id', id).single()),
    cargarCatalogos(),
  ]);
  const deptos = porId(catalogos.departamentos);
  const puestos = porId(catalogos.puestos);
  const jefe = emp.jefe_id ? await ok(empresa('empleados').select('nombres, apellidos').eq('id', emp.jefe_id).maybeSingle()) : null;

  el.innerHTML = `
    <a class="miga" href="#/empleados">← Empleados</a>
    <div class="encabezado">
      <div class="persona">
        <span class="avatar grande">${esc(iniciales(emp))}</span>
        <div><h1>${esc(nombreCompleto(emp))}</h1>
        <p>${esc(emp.codigo)} · ${esc(puestos[emp.puesto_id]?.nombre ?? 'Sin puesto')} · ${badge(emp.estado)}</p></div>
      </div>
      <div class="acciones">
        ${puedeEditar ? '<button type="button" id="editar">Editar datos</button>' : ''}
        ${puedeEditar && emp.estado !== 'baja' ? '<button type="button" class="peligro" id="baja">Dar de baja</button>' : ''}
      </div>
    </div>
    <div class="tarjeta" id="pestanas"></div>`;

  const dato = (t, v) => `<div><dt>${esc(t)}</dt><dd>${v ?? '—'}</dd></div>`;

  const pestanas = [
    {
      id: 'datos',
      titulo: 'Datos generales',
      render: (p) => {
        p.innerHTML = `<div class="tarjeta-cuerpo"><dl class="datos">
          ${dato('DPI', esc(emp.dpi))}${dato('NIT', esc(emp.nit))}${dato('Afiliación IGSS', esc(emp.afiliacion_igss))}
          ${dato('Fecha de nacimiento', fecha(emp.fecha_nacimiento))}
          ${dato('Género', esc({ M: 'Masculino', F: 'Femenino', O: 'Otro' }[emp.genero]))}
          ${dato('Estado civil', esc(etiqueta(emp.estado_civil)))}
          ${dato('Correo', esc(emp.email))}${dato('Teléfono', esc(emp.telefono))}
          ${dato('Dirección', esc(emp.direccion))}
          ${dato('Departamento', esc(deptos[emp.departamento_id]?.nombre))}
          ${dato('Puesto', esc(puestos[emp.puesto_id]?.nombre))}
          ${dato('Jefe inmediato', esc(jefe ? nombreCompleto(jefe) : null))}
          ${dato('Fecha de ingreso', fecha(emp.fecha_ingreso))}
          ${verNomina ? dato('Salario base', moneda(emp.salario_base)) : ''}
          ${verNomina ? dato('Banco / cuenta', esc([emp.banco, emp.cuenta_bancaria].filter(Boolean).join(' · '))) : ''}
          ${dato('Contacto de emergencia', esc([emp.contacto_emergencia, emp.telefono_emergencia].filter(Boolean).join(' · ')))}
          ${emp.estado === 'baja' ? dato('Fecha de baja', fecha(emp.fecha_baja)) + dato('Motivo de baja', esc(emp.motivo_baja)) : ''}
        </dl></div>`;
      },
    },
    {
      id: 'contratos',
      titulo: 'Contratos',
      render: (p) =>
        sublista(p, {
          titulo: 'Historial de contratos y salarios',
          textoNuevo: 'Nuevo contrato',
          puedeEditar,
          cargar: () => ok(empresa('contratos').select('*').eq('empleado_id', id).order('fecha_inicio', { ascending: false })),
          columnas: [
            { titulo: 'Tipo', render: (c) => esc(etiqueta(c.tipo)) },
            { titulo: 'Jornada', render: (c) => esc(etiqueta(c.jornada)) },
            { titulo: 'Inicio', render: (c) => fecha(c.fecha_inicio) },
            { titulo: 'Fin', render: (c) => fecha(c.fecha_fin) },
            { titulo: 'Salario', render: (c) => (verNomina ? moneda(c.salario) : '•••'), clase: 'numero' },
          ],
          campos: [
            { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: [['indefinido', 'Indefinido'], ['plazo_fijo', 'Plazo fijo'], ['obra_determinada', 'Obra determinada']] },
            { nombre: 'jornada', etiqueta: 'Jornada', tipo: 'select', requerido: true, opciones: [['diurna', 'Diurna'], ['nocturna', 'Nocturna'], ['mixta', 'Mixta']] },
            { nombre: 'fecha_inicio', etiqueta: 'Fecha de inicio', tipo: 'date', requerido: true },
            { nombre: 'fecha_fin', etiqueta: 'Fecha de fin', tipo: 'date' },
            { nombre: 'salario', etiqueta: 'Salario (Q)', tipo: 'number', paso: '0.01', requerido: true },
            { nombre: 'actualizar', etiqueta: 'Actualizar salario base del empleado', tipo: 'checkbox', completo: true },
            { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea' },
          ],
          valores: { fecha_inicio: hoy(), salario: emp.salario_base, actualizar: true },
          guardar: async ({ actualizar, ...datos }) => {
            await ok(empresa('contratos').insert({ ...datos, empleado_id: id }));
            if (actualizar) {
              await ok(empresa('empleados').update({ salario_base: datos.salario }).eq('id', id));
              emp.salario_base = datos.salario;
            }
          },
          eliminar: (c) => ok(empresa('contratos').delete().eq('id', c.id)),
        }),
    },
    {
      id: 'ausencias',
      titulo: 'Vacaciones y permisos',
      render: (p) =>
        sublista(p, {
          titulo: 'Ausencias registradas',
          textoNuevo: 'Registrar ausencia',
          puedeEditar,
          cargar: () => ok(empresa('ausencias').select('*').eq('empleado_id', id).order('fecha_inicio', { ascending: false })),
          columnas: [
            { titulo: 'Tipo', render: (a) => esc(etiqueta(a.tipo)) },
            { titulo: 'Desde', render: (a) => fecha(a.fecha_inicio) },
            { titulo: 'Hasta', render: (a) => fecha(a.fecha_fin) },
            { titulo: 'Días', campo: 'dias', clase: 'numero' },
            { titulo: 'Estado', render: (a) => badge(a.estado) },
          ],
          campos: [
            { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: TIPOS_AUSENCIA },
            { nombre: 'dias', etiqueta: 'Días', tipo: 'number', paso: '0.5', min: 0.5, requerido: true },
            { nombre: 'fecha_inicio', etiqueta: 'Desde', tipo: 'date', requerido: true },
            { nombre: 'fecha_fin', etiqueta: 'Hasta', tipo: 'date', requerido: true },
            { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'textarea' },
          ],
          guardar: (datos) => ok(empresa('ausencias').insert({ ...datos, empleado_id: id, estado: 'aprobada', aprobado_por: obtenerSesion().user.id })),
          eliminar: (a) => ok(empresa('ausencias').delete().eq('id', a.id)),
          alMontar: async (panel, filas) => {
            const anio = new Date().getFullYear();
            const usados = filas
              .filter((a) => a.tipo === 'vacaciones' && a.estado === 'aprobada' && a.fecha_inicio.startsWith(anio))
              .reduce((s, a) => s + Number(a.dias), 0);
            panel.querySelector('.tarjeta-titulo h3').insertAdjacentHTML(
              'afterend',
              `<span class="texto-suave">Vacaciones ${anio}: ${usados} de 15 días hábiles usados</span>`,
            );
          },
        }),
    },
    {
      id: 'evaluaciones',
      titulo: 'Evaluaciones',
      render: (p) =>
        sublista(p, {
          titulo: 'Evaluaciones de desempeño',
          textoNuevo: 'Nueva evaluación',
          puedeEditar: puedeEditar || esJefe,
          cargar: () => ok(empresa('evaluaciones').select('*').eq('empleado_id', id).order('fecha', { ascending: false })),
          columnas: [
            { titulo: 'Período', campo: 'periodo' },
            { titulo: 'Fecha', render: (e) => fecha(e.fecha) },
            { titulo: 'Calificación', render: (e) => estrellas(e.calificacion) },
            { titulo: 'Fortalezas', campo: 'fortalezas' },
            { titulo: 'Áreas de mejora', campo: 'mejoras' },
          ],
          campos: [
            { nombre: 'periodo', etiqueta: 'Período evaluado', requerido: true, placeholder: 'Ej. Primer semestre 2026' },
            { nombre: 'calificacion', etiqueta: 'Calificación', tipo: 'select', requerido: true, opciones: [[5, '5 · Excelente'], [4, '4 · Muy bueno'], [3, '3 · Bueno'], [2, '2 · Regular'], [1, '1 · Deficiente']] },
            { nombre: 'fortalezas', etiqueta: 'Fortalezas', tipo: 'textarea' },
            { nombre: 'mejoras', etiqueta: 'Áreas de mejora', tipo: 'textarea' },
          ],
          guardar: (datos) => ok(empresa('evaluaciones').insert({ ...datos, calificacion: Number(datos.calificacion), empleado_id: id })),
          eliminar: (e) => ok(empresa('evaluaciones').delete().eq('id', e.id)),
        }),
    },
    {
      id: 'documentos',
      titulo: 'Documentos',
      render: (p) =>
        sublista(p, {
          titulo: 'Expediente digital',
          textoNuevo: 'Subir documento',
          puedeEditar,
          cargar: () => ok(empresa('documentos_empleado').select('*').eq('empleado_id', id).order('created_at', { ascending: false })),
          columnas: [
            { titulo: 'Tipo', render: (d) => esc(etiqueta(d.tipo)) },
            { titulo: 'Nombre', campo: 'nombre' },
            { titulo: 'Fecha', render: (d) => fecha(d.created_at) },
            { titulo: 'Archivo', render: (d) => botonArchivo('documentos', d.ruta) },
          ],
          campos: [
            {
              nombre: 'tipo', etiqueta: 'Tipo de documento', tipo: 'select', requerido: true,
              opciones: [['dpi', 'DPI'], ['contrato', 'Contrato firmado'], ['titulo', 'Título académico'], ['antecedentes', 'Antecedentes'], ['igss', 'Carné IGSS'], ['constancia', 'Constancia'], ['otro', 'Otro']],
            },
            { nombre: 'nombre', etiqueta: 'Descripción', requerido: true },
            { nombre: 'archivo', etiqueta: 'Archivo (PDF o imagen, máx. 10 MB)', tipo: 'file', requerido: true, completo: true },
          ],
          guardar: async (datos, form) => {
            const ruta = await subirArchivo('documentos', id, form.archivo.files[0]);
            await ok(empresa('documentos_empleado').insert({ ...datos, empleado_id: id, ruta }));
          },
          eliminar: async (d) => {
            await supabase.storage.from('documentos').remove([d.ruta]);
            await ok(empresa('documentos_empleado').delete().eq('id', d.id));
          },
        }),
    },
  ];

  if (verNomina) {
    pestanas.push({
      id: 'recibos',
      titulo: 'Recibos de nómina',
      render: (p) =>
        sublista(p, {
          titulo: 'Pagos realizados',
          cargar: () =>
            ok(empresa('recibos_nomina').select('*, periodo:periodos_nomina(id, nombre, fecha_pago, estado)').eq('empleado_id', id).order('created_at', { ascending: false })),
          columnas: [
            { titulo: 'Período', render: (r) => `<a href="#/nomina/${r.periodo.id}">${esc(r.periodo.nombre)}</a>` },
            { titulo: 'Estado', render: (r) => badge(r.periodo.estado) },
            { titulo: 'Ingresos', render: (r) => moneda(r.total_ingresos), clase: 'numero' },
            { titulo: 'Descuentos', render: (r) => moneda(r.total_descuentos), clase: 'numero' },
            { titulo: 'Líquido', render: (r) => `<strong>${moneda(r.liquido)}</strong>`, clase: 'numero' },
          ],
          vacio: 'Aún no hay recibos para este empleado.',
        }),
    });
  }

  montarPestanas(el.querySelector('#pestanas'), pestanas);

  el.querySelector('#editar')?.addEventListener('click', async () => {
    const jefes = await ok(empresa('empleados').select('id, nombres, apellidos').eq('estado', 'activo').neq('id', id).order('apellidos'));
    abrirFormulario({
      titulo: 'Editar empleado',
      campos: camposEmpleado(catalogos, jefes),
      valores: emp,
      alGuardar: async (datos) => {
        await ok(empresa('empleados').update(datos).eq('id', id));
        recargarVista();
      },
    });
  });

  el.querySelector('#baja')?.addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Dar de baja al empleado',
      textoGuardar: 'Confirmar baja',
      campos: [
        { nombre: 'fecha_baja', etiqueta: 'Fecha de baja', tipo: 'date', requerido: true },
        {
          nombre: 'tipo', etiqueta: 'Tipo de terminación', tipo: 'select', requerido: true,
          opciones: [['renuncia', 'Renuncia'], ['despido_justificado', 'Despido justificado'], ['despido_injustificado', 'Despido injustificado'], ['fin_contrato', 'Fin de contrato'], ['otro', 'Otro']],
        },
        { nombre: 'detalle', etiqueta: 'Detalle', tipo: 'textarea' },
      ],
      valores: { fecha_baja: hoy() },
      alGuardar: async ({ fecha_baja, tipo, detalle }) => {
        await ok(empresa('empleados').update({ estado: 'baja', fecha_baja, motivo_baja: [etiqueta(tipo), detalle].filter(Boolean).join(': ') }).eq('id', id));
        recargarVista();
      },
    }),
  );
}
