// Netlify Function que publica la API REST en /api/v1/* (ver netlify.toml).
import { manejar } from '../../server/app.js';

export default (request, context) => manejar(request, { ip: context.ip });
