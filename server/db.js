// Conexión SQL directa a PostgreSQL (Supabase, pooler en modo transacción).
// Cada consulta corre dentro de una transacción que adopta la identidad del
// usuario verificado, así que las políticas RLS se aplican igual que en la API.
import postgres from 'postgres';
import { config } from './supabase.js';

let sql = null;

export const hayConexionDirecta = () => Boolean(config.baseDatos);

function conexion() {
  sql ??= postgres(config.baseDatos, {
    prepare: false, // requerido por el pooler de Supabase en modo transacción
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: 'require',
  });
  return sql;
}

/** Ejecuta fn(tx) como el usuario autenticado (rol "authenticated" + RLS). */
export function comoUsuario(usuario, fn) {
  const claims = JSON.stringify({ sub: usuario.id, email: usuario.email, role: 'authenticated' });
  return conexion().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  });
}
