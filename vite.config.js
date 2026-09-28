import { Readable } from 'node:stream';
import { defineConfig, loadEnv } from 'vite';

/**
 * En desarrollo, sirve la API (/api/v1/*) desde el mismo servidor de Vite,
 * ejecutando el mismo código que usa la Netlify Function en producción.
 */
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/v1')) return next();
        try {
          const { manejar } = await server.ssrLoadModule('/server/app.js');
          const tieneCuerpo = !['GET', 'HEAD'].includes(req.method);
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers,
            body: tieneCuerpo ? Readable.toWeb(req) : undefined,
            duplex: tieneCuerpo ? 'half' : undefined,
          });
          const respuesta = await manejar(request, { ip: req.socket.remoteAddress });
          res.statusCode = respuesta.status;
          respuesta.headers.forEach((valor, clave) => {
            if (clave !== 'set-cookie') res.setHeader(clave, valor);
          });
          const cookies = respuesta.headers.getSetCookie();
          if (cookies.length) res.setHeader('Set-Cookie', cookies);
          res.end(Buffer.from(await respuesta.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [apiLocal()],
});
