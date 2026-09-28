import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manejar, segmentos } from '../server/app.js';
import { cookie, cookiesDeSesion, ErrorHttp, leerCookies, verificarCsrf } from '../server/http.js';
import {
  sanearTexto, sanearValor, validarDatos, validarFiltros, validarId, validarOrden, validarSelect,
} from '../server/sanear.js';
import { tipoReal } from '../server/rutas/archivos.js';

const lanza = (fn, status) => assert.throws(fn, (e) => e instanceof ErrorHttp && e.status === status);

test('sanitización XSS: quita etiquetas HTML y caracteres de control', () => {
  assert.equal(sanearTexto('  Ana <script>alert(1)</script> López  '), 'Ana alert(1) López');
  assert.equal(sanearTexto('<img src=x onerror=alert(1)>Juan'), 'Juan');
  assert.equal(sanearTexto('Salario 5 < 10 y 20 > 3'), 'Salario 5 < 10 y 20 > 3');
  assert.equal(sanearTexto('Hola\u0000mundo'), 'Holamundo');
  assert.deepEqual(sanearValor({ nombre: '<b>Eva</b>', edad: 30, datos: { nota: '<i>x</i>' } }), { nombre: 'Eva', edad: 30, datos: { nota: 'x' } });
});

test('rechaza nombres de campo peligrosos e intentos de inyección', () => {
  lanza(() => validarDatos({ 'nombre; drop table empleados': 'x' }), 400);
  lanza(() => validarDatos({ 'rol"': 'admin' }), 400);
  lanza(() => validarDatos([]), 400);
  lanza(() => validarDatos('texto'), 400);
  lanza(() => validarSelect('*; delete from empleados'), 400);
  lanza(() => validarFiltros([['id', 'eq); drop', '1']]), 400);
  lanza(() => validarFiltros([['id;--', 'eq', '1']]), 400);
  lanza(() => validarFiltros([['or', 'or', "estado.eq.activo'; drop"]]), 400);
  lanza(() => validarOrden('nombre.desc;drop'), 400);
  lanza(() => validarId("1' or '1'='1"), 400);
});

test('acepta consultas válidas', () => {
  assert.equal(validarSelect('*, empleado:empleados(nombres, apellidos, puesto:puestos(nombre))'), '*, empleado:empleados(nombres, apellidos, puesto:puestos(nombre))');
  assert.deepEqual(validarFiltros([['estado', 'eq', 'activo'], ['tipo', 'in', ['a', 'b']], ['or', 'or', 'estado.eq.activo,and(estado.eq.baja,fecha_baja.gte.2026-09-01)']]), [
    ['estado', 'eq', 'activo'], ['tipo', 'in', ['a', 'b']], ['or', 'or', 'estado.eq.activo,and(estado.eq.baja,fecha_baja.gte.2026-09-01)'],
  ]);
  assert.deepEqual(validarOrden('apellidos.asc,fecha.desc'), [['apellidos', 'asc'], ['fecha', 'desc']]);
  assert.equal(validarId('6daba4fb-3bf8-4c87-a771-c27bd91067e9'), '6daba4fb-3bf8-4c87-a771-c27bd91067e9');
  assert.equal(validarId('1'), '1');
});

test('cookies de sesión HttpOnly, Secure y SameSite=Strict', () => {
  const [acceso, renovacion] = cookiesDeSesion({ access_token: 'a.b.c', refresh_token: 'r', expires_in: 3600 }, false);
  for (const c of [acceso, renovacion]) {
    assert.match(c, /HttpOnly/);
    assert.match(c, /Secure/);
    assert.match(c, /SameSite=Strict/);
    assert.match(c, /Path=\/api/);
  }
  assert.match(acceso, /Max-Age=3600/);
  assert.doesNotMatch(renovacion, /Max-Age/); // sin "recordar": cookie de sesión del navegador
  assert.match(cookiesDeSesion({ access_token: 'a', refresh_token: 'r' }, true)[1], /Max-Age=2592000/);
  assert.deepEqual(leerCookies(new Request('http://x', { headers: { cookie: 'rrhh_at=abc; otro=1' } })), { rrhh_at: 'abc', otro: '1' });
  assert.match(cookie('x', '', { maxAge: 0 }), /Max-Age=0/);
});

test('protección CSRF', () => {
  const post = (headers) => new Request('https://rrhh.test/api/v1/empleados', { method: 'POST', headers });
  lanza(() => verificarCsrf(post({})), 403);
  lanza(() => verificarCsrf(post({ 'x-requested-with': 'fetch', origin: 'https://sitio-malicioso.com' })), 403);
  assert.doesNotThrow(() => verificarCsrf(post({ 'x-requested-with': 'fetch', origin: 'https://rrhh.test' })));
  assert.doesNotThrow(() => verificarCsrf(new Request('https://rrhh.test/api/v1/empleados')));
});

test('rutas de la API', () => {
  assert.deepEqual(segmentos(new URL('https://x/api/v1/empleados/123')), ['empleados', '123']);
  assert.deepEqual(segmentos(new URL('https://x/.netlify/functions/api/auth/login')), ['auth', 'login']);
  assert.deepEqual(segmentos(new URL('https://x/api/v1')), []);
});

test('detecta el tipo real de un archivo por su contenido', () => {
  const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  assert.equal(tipoReal(bytes('%PDF-1.7')), 'application/pdf');
  assert.equal(tipoReal(bytes('\x89PNG\r\n')), 'image/png');
  assert.equal(tipoReal(bytes('MZ\x90\x00')), null); // un .exe renombrado a .pdf
});

test('respuestas HTTP de la API', async () => {
  const pedir = (ruta, init = {}) => manejar(new Request(`https://rrhh.test/api/v1${ruta}`, init));
  let r = await pedir('/empleados');
  assert.equal(r.status, 401); // sin sesión
  assert.equal((await r.json()).error.codigo, 'NO_AUTENTICADO');

  r = await pedir('/empleados', { method: 'POST', body: '{}' });
  assert.equal(r.status, 403); // sin cabecera anti-CSRF

  r = await pedir('/auth/login', { method: 'POST', headers: { 'x-requested-with': 'fetch', 'content-type': 'text/plain' }, body: 'x' });
  assert.equal(r.status, 400); // Content-Type incorrecto

  r = await pedir('/auth/desconocida', { method: 'GET' });
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('token CSRF ligado a la sesión y cabecera Authorization: Bearer', async () => {
  process.env.SUPABASE_URL ||= 'https://demo.supabase.co';
  process.env.SUPABASE_ANON_KEY ||= 'clave-de-prueba';
  const { exigirSesion, tokenCsrf } = await import('../server/sesion.js');
  const jwt = (carga) => ['e30', Buffer.from(JSON.stringify(carga)).toString('base64url'), 'firma'].join('.');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = jwt({ sub: 'u1', session_id: 's1', exp });

  assert.equal(tokenCsrf(token), tokenCsrf(jwt({ sub: 'u1', session_id: 's1', exp: exp + 60 }))); // no cambia al renovar
  assert.notEqual(tokenCsrf(token), tokenCsrf(jwt({ sub: 'u1', session_id: 's2', exp })));

  const pedir = (headers) => new Request('https://rrhh.test/api/v1/empleados', { method: 'POST', headers });
  await assert.rejects(exigirSesion(pedir({ cookie: `rrhh_at=${token}` })), (e) => e.status === 403 && e.codigo === 'CSRF');
  await assert.rejects(exigirSesion(pedir({ cookie: `rrhh_at=${token}`, 'x-csrf-token': 'falso' })), (e) => e.status === 403);
  assert.equal((await exigirSesion(pedir({ cookie: `rrhh_at=${token}`, 'x-csrf-token': tokenCsrf(token) }))).token, token);
  // Con Bearer no hay cookie que el navegador envíe solo: no aplica CSRF
  assert.equal((await exigirSesion(pedir({ authorization: `Bearer ${token}` }))).token, token);
  await assert.rejects(exigirSesion(pedir({ authorization: 'Bearer basura' })), (e) => e.status === 401);
});

test('sanitización en el cliente antes de enviar a la API', async () => {
  const { sanearEntrada } = await import('../src/api.js');
  assert.deepEqual(
    sanearEntrada({ nombres: ' <b>Ana</b> ', notas: ['<script>x</script>ok'], password: ' <Clave1> ', salario: 5000 }),
    { nombres: 'Ana', notas: ['xok'], password: ' <Clave1> ', salario: 5000 },
  );
});
