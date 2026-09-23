// Catálogos y definiciones de formularios compartidos entre vistas.
import { empresa, ok } from './supabase.js';
import { nombreCompleto, opciones } from './ui.js';

export async function cargarCatalogos() {
  const [departamentos, puestos] = await Promise.all([
    ok(empresa('departamentos').select('id, nombre, jefe_id').order('nombre')),
    ok(empresa('puestos').select('id, nombre, departamento_id, salario_min, salario_max').order('nombre')),
  ]);
  return { departamentos, puestos };
}

export const TIPOS_AUSENCIA = [
  ['vacaciones', 'Vacaciones'],
  ['permiso_con_goce', 'Permiso con goce de salario'],
  ['permiso_sin_goce', 'Permiso sin goce de salario'],
  ['suspension_igss', 'Suspensión IGSS'],
  ['falta', 'Falta injustificada'],
];

export const ETAPAS = [
  ['aplicado', 'Aplicó'],
  ['filtro', 'Filtro de CV'],
  ['entrevista', 'Entrevista'],
  ['pruebas', 'Pruebas'],
  ['oferta', 'Oferta'],
  ['contratado', 'Contratado'],
  ['rechazado', 'Rechazado'],
];

export function camposEmpleado({ departamentos, puestos }, jefes = []) {
  return [
    { nombre: 'nombres', etiqueta: 'Nombres', requerido: true },
    { nombre: 'apellidos', etiqueta: 'Apellidos', requerido: true },
    { nombre: 'dpi', etiqueta: 'DPI / CUI', patron: '\\d{13}', ayuda: '13 dígitos, sin espacios' },
    { nombre: 'nit', etiqueta: 'NIT' },
    { nombre: 'afiliacion_igss', etiqueta: 'No. afiliación IGSS' },
    { nombre: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'date' },
    { nombre: 'genero', etiqueta: 'Género', tipo: 'select', opciones: [['M', 'Masculino'], ['F', 'Femenino'], ['O', 'Otro']] },
    {
      nombre: 'estado_civil', etiqueta: 'Estado civil', tipo: 'select',
      opciones: [['soltero', 'Soltero(a)'], ['casado', 'Casado(a)'], ['unido', 'Unido(a)'], ['divorciado', 'Divorciado(a)'], ['viudo', 'Viudo(a)']],
    },
    { nombre: 'email', etiqueta: 'Correo', tipo: 'email' },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
    { nombre: 'direccion', etiqueta: 'Dirección', completo: true },
    { nombre: 'departamento_id', etiqueta: 'Departamento', tipo: 'select', opciones: opciones(departamentos) },
    { nombre: 'puesto_id', etiqueta: 'Puesto', tipo: 'select', opciones: opciones(puestos) },
    { nombre: 'jefe_id', etiqueta: 'Jefe inmediato', tipo: 'select', opciones: opciones(jefes, nombreCompleto) },
    { nombre: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'date', requerido: true },
    { nombre: 'salario_base', etiqueta: 'Salario base mensual (Q)', tipo: 'number', paso: '0.01', min: 0, requerido: true },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, defecto: 'activo', opciones: [['activo', 'Activo'], ['suspendido', 'Suspendido'], ['baja', 'Baja']] },
    { nombre: 'banco', etiqueta: 'Banco' },
    { nombre: 'cuenta_bancaria', etiqueta: 'No. de cuenta' },
    { nombre: 'contacto_emergencia', etiqueta: 'Contacto de emergencia' },
    { nombre: 'telefono_emergencia', etiqueta: 'Teléfono de emergencia', tipo: 'tel' },
  ];
}
