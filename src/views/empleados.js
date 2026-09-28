import { tieneRol } from '../auth.js';
import { camposEmpleado, cargarCatalogos } from '../catalogos.js';
import { navegar } from '../router.js';
import { empresa, ok } from '../api.js';
import {
  abrirFormulario, badge, descargarCSV, esc, fecha, hoy, moneda, nombreCompleto, persona, porId, tabla, toast,
} from '../ui.js';

export async function render(el) {
  const puedeEditar = tieneRol('admin', 'rrhh');
  const verSalario = tieneRol('admin', 'rrhh', 'nomina');
  const catalogos = await cargarCatalogos();
  const deptos = porId(catalogos.departamentos);
  const puestos = porId(catalogos.puestos);
  let empleados = [];

  el.innerHTML = `
    <div class="encabezado">
      <div><h1>Empleados</h1><p>Expedientes del personal de la empresa.</p></div>
      <div class="acciones">
        <button type="button" id="exportar">Exportar CSV</button>
        ${puedeEditar ? '<button type="button" class="primario" id="nuevo">+ Nuevo empleado</button>' : ''}
      </div>
    </div>
    <div class="tarjeta">
      <div class="filtros">
        <input type="search" id="buscar" placeholder="Buscar por nombre, código o DPI…" />
        <select id="f-depto"><option value="">Todos los departamentos</option>
          ${catalogos.departamentos.map((d) => `<option value="${d.id}">${esc(d.nombre)}</option>`).join('')}</select>
        <select id="f-estado">
          <option value="activo">Activos</option><option value="suspendido">Suspendidos</option>
          <option value="baja">Bajas</option><option value="">Todos</option></select>
      </div>
      <div id="lista"></div>
    </div>`;

  const lista = el.querySelector('#lista');
  const buscar = el.querySelector('#buscar');
  const fDepto = el.querySelector('#f-depto');
  const fEstado = el.querySelector('#f-estado');

  const columnas = [
    { titulo: 'Empleado', render: (e) => persona(e, e.email) },
    { titulo: 'Código', campo: 'codigo' },
    { titulo: 'Departamento', render: (e) => esc(deptos[e.departamento_id]?.nombre ?? '—') },
    { titulo: 'Puesto', render: (e) => esc(puestos[e.puesto_id]?.nombre ?? '—') },
    { titulo: 'Ingreso', render: (e) => fecha(e.fecha_ingreso) },
    ...(verSalario ? [{ titulo: 'Salario', render: (e) => moneda(e.salario_base), clase: 'numero' }] : []),
    { titulo: 'Estado', render: (e) => badge(e.estado) },
  ];

  function filtrados() {
    const texto = buscar.value.trim().toLowerCase();
    return empleados.filter(
      (e) =>
        (!fDepto.value || e.departamento_id === fDepto.value) &&
        (!texto || `${nombreCompleto(e)} ${e.codigo} ${e.dpi ?? ''}`.toLowerCase().includes(texto)),
    );
  }

  const pintar = () => {
    lista.innerHTML = tabla(columnas, filtrados(), { clicable: true, vacio: 'No se encontraron empleados.' });
  };

  async function cargar() {
    let consulta = empresa('empleados').select('*').order('apellidos');
    if (fEstado.value) consulta = consulta.eq('estado', fEstado.value);
    empleados = await ok(consulta);
    pintar();
  }

  buscar.addEventListener('input', pintar);
  fDepto.addEventListener('change', pintar);
  fEstado.addEventListener('change', cargar);
  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    if (fila) navegar(`/empleados/${fila.dataset.id}`);
  });

  el.querySelector('#exportar').addEventListener('click', () =>
    descargarCSV(`empleados_${hoy()}.csv`, [
      { titulo: 'Código', campo: 'codigo' },
      { titulo: 'Nombres', campo: 'nombres' },
      { titulo: 'Apellidos', campo: 'apellidos' },
      { titulo: 'DPI', campo: 'dpi' },
      { titulo: 'Correo', campo: 'email' },
      { titulo: 'Departamento', valor: (e) => deptos[e.departamento_id]?.nombre },
      { titulo: 'Puesto', valor: (e) => puestos[e.puesto_id]?.nombre },
      { titulo: 'Ingreso', campo: 'fecha_ingreso' },
      ...(verSalario ? [{ titulo: 'Salario', campo: 'salario_base' }] : []),
      { titulo: 'Estado', campo: 'estado' },
    ], filtrados()),
  );

  el.querySelector('#nuevo')?.addEventListener('click', async () => {
    const jefes = await ok(empresa('empleados').select('id, nombres, apellidos').eq('estado', 'activo').order('apellidos'));
    abrirFormulario({
      titulo: 'Nuevo empleado',
      campos: camposEmpleado(catalogos, jefes),
      valores: { fecha_ingreso: hoy(), estado: 'activo' },
      alGuardar: async (datos) => {
        const [nuevo] = await ok(empresa('empleados').insert(datos).select('id'));
        await ok(empresa('contratos').insert({ empleado_id: nuevo.id, fecha_inicio: datos.fecha_ingreso, salario: datos.salario_base }));
        toast('Empleado registrado.');
        navegar(`/empleados/${nuevo.id}`);
      },
    });
  });

  await cargar();
}
