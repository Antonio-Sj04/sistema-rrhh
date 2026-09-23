import { cargarCatalogos } from '../catalogos.js';
import { empresa, ok } from '../supabase.js';
import { abrirFormulario, confirmar, esc, moneda, mostrarError, nombreCompleto, opciones, porId, tabla, toast } from '../ui.js';

export async function render(el) {
  const [{ departamentos, puestos }, empleados, conteo, datosEmpresa] = await Promise.all([
    cargarCatalogos(),
    ok(empresa('empleados').select('id, nombres, apellidos, departamento_id').eq('estado', 'activo').order('apellidos')),
    ok(empresa('empleados').select('departamento_id').eq('estado', 'activo')),
    ok(empresa('configuracion').select('*').eq('id', 1).single()),
  ]);
  const deptos = porId(departamentos);
  const emps = porId(empleados);
  const porDepto = conteo.reduce((m, e) => ((m[e.departamento_id] = (m[e.departamento_id] ?? 0) + 1), m), {});

  const acciones = (tipo, id) => `<div class="acciones" style="justify-content:flex-end">
    <button type="button" class="pequeno" data-editar="${tipo}:${id}">Editar</button>
    <button type="button" class="pequeno peligro" data-eliminar="${tipo}:${id}">Eliminar</button></div>`;

  el.innerHTML = `
    <div class="encabezado"><div><h1>Organización</h1><p>Datos de la empresa, departamentos, jefaturas y catálogo de puestos.</p></div></div>
    <div class="tarjeta" style="margin-bottom:16px">
      <div class="tarjeta-titulo"><div><h2>Datos de la empresa</h2>
        <div class="texto-suave">Aparecen en el encabezado y la firma de las constancias</div></div>
        <button type="button" class="pequeno primario" id="editar-empresa">Editar</button></div>
      <div class="tarjeta-cuerpo">${datosEmpresa.nombre
        ? `<dl class="datos">
            <div><dt>Nombre</dt><dd>${esc(datosEmpresa.nombre)}</dd></div>
            <div><dt>NIT</dt><dd>${esc(datosEmpresa.nit ?? '—')}</dd></div>
            <div><dt>Dirección</dt><dd>${esc(datosEmpresa.direccion ?? '—')}</dd></div>
            <div><dt>Teléfono / correo</dt><dd>${esc([datosEmpresa.telefono, datosEmpresa.correo].filter(Boolean).join(' · ') || '—')}</dd></div>
            <div><dt>Ciudad</dt><dd>${esc(datosEmpresa.ciudad)}</dd></div>
            <div><dt>Firma las constancias</dt><dd>${esc([datosEmpresa.firmante_nombre, datosEmpresa.firmante_cargo].filter(Boolean).join(' · ') || '—')}</dd></div>
          </dl>`
        : '<div class="aviso" style="margin:0">Completa los datos de la empresa para poder emitir constancias.</div>'}</div>
    </div>
    <div class="rejilla rejilla-2">
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h2>Departamentos</h2><button type="button" class="pequeno primario" id="nuevo-depto">+ Departamento</button></div>
        ${tabla(
          [
            { titulo: 'Nombre', render: (d) => `<strong>${esc(d.nombre)}</strong>` },
            { titulo: 'Jefe', render: (d) => esc(d.jefe_id ? nombreCompleto(emps[d.jefe_id]) : '—') },
            { titulo: 'Personal', render: (d) => porDepto[d.id] ?? 0, clase: 'numero' },
            { titulo: '', render: (d) => acciones('depto', d.id) },
          ],
          departamentos,
          { vacio: 'Crea tu primer departamento.' },
        )}
      </div>
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h2>Puestos</h2><button type="button" class="pequeno primario" id="nuevo-puesto">+ Puesto</button></div>
        ${tabla(
          [
            { titulo: 'Puesto', render: (p) => `<strong>${esc(p.nombre)}</strong>` },
            { titulo: 'Departamento', render: (p) => esc(deptos[p.departamento_id]?.nombre ?? '—') },
            { titulo: 'Banda salarial', render: (p) => (p.salario_min ? `${moneda(p.salario_min)} – ${moneda(p.salario_max)}` : '—'), clase: 'numero' },
            { titulo: '', render: (p) => acciones('puesto', p.id) },
          ],
          puestos,
          { vacio: 'Crea tu primer puesto.' },
        )}
      </div>
    </div>`;

  const camposDepto = [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
    { nombre: 'jefe_id', etiqueta: 'Jefe del departamento', tipo: 'select', opciones: opciones(empleados, nombreCompleto) },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
  ];
  const camposPuesto = [
    { nombre: 'nombre', etiqueta: 'Nombre del puesto', requerido: true },
    { nombre: 'departamento_id', etiqueta: 'Departamento', tipo: 'select', opciones: opciones(departamentos) },
    { nombre: 'salario_min', etiqueta: 'Salario mínimo (Q)', tipo: 'number', paso: '0.01', min: 0 },
    { nombre: 'salario_max', etiqueta: 'Salario máximo (Q)', tipo: 'number', paso: '0.01', min: 0 },
    { nombre: 'descripcion', etiqueta: 'Funciones del puesto', tipo: 'textarea' },
  ];
  const config = {
    depto: { tabla: 'departamentos', campos: camposDepto, lista: departamentos, nombre: 'departamento' },
    puesto: { tabla: 'puestos', campos: camposPuesto, lista: puestos, nombre: 'puesto' },
  };

  const recargar = () => render(el).catch(mostrarError);

  function editar(tipo, registro) {
    const c = config[tipo];
    abrirFormulario({
      titulo: registro ? `Editar ${c.nombre}` : `Nuevo ${c.nombre}`,
      campos: c.campos,
      valores: registro ?? {},
      alGuardar: async (datos) => {
        await ok(registro ? empresa(c.tabla).update(datos).eq('id', registro.id) : empresa(c.tabla).insert(datos));
        toast('Guardado.');
        recargar();
      },
    });
  }

  el.querySelector('#editar-empresa').addEventListener('click', () =>
    abrirFormulario({
      titulo: 'Datos de la empresa',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre o razón social', requerido: true, completo: true },
        { nombre: 'nit', etiqueta: 'NIT' },
        { nombre: 'ciudad', etiqueta: 'Ciudad', requerido: true },
        { nombre: 'direccion', etiqueta: 'Dirección', completo: true },
        { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
        { nombre: 'correo', etiqueta: 'Correo', tipo: 'email' },
        { nombre: 'firmante_nombre', etiqueta: 'Nombre de quien firma', placeholder: 'Ej.: Licda. María López' },
        { nombre: 'firmante_cargo', etiqueta: 'Cargo de quien firma', placeholder: 'Ej.: Gerente de Recursos Humanos' },
      ],
      valores: datosEmpresa,
      alGuardar: async (datos) => {
        await ok(empresa('configuracion').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', 1));
        toast('Datos de la empresa guardados.');
        recargar();
      },
    }),
  );
  el.querySelector('#nuevo-depto').addEventListener('click', () => editar('depto'));
  el.querySelector('#nuevo-puesto').addEventListener('click', () => editar('puesto'));
  el.querySelector('.rejilla').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-editar], [data-eliminar]');
    if (!b) return;
    const [tipo, id] = (b.dataset.editar ?? b.dataset.eliminar).split(':');
    const c = config[tipo];
    const registro = c.lista.find((x) => x.id === id);
    if (b.dataset.editar) return editar(tipo, registro);
    if (!(await confirmar(`¿Eliminar "${registro.nombre}"?`, { textoAceptar: 'Eliminar', peligro: true }))) return;
    try {
      await ok(empresa(c.tabla).delete().eq('id', id));
      toast('Eliminado.');
      recargar();
    } catch (error) {
      mostrarError(error);
    }
  });
}
