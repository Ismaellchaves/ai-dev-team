import { timingSafeEqual } from 'node:crypto';
import { next } from '@vercel/functions';

export const config = { runtime: 'nodejs' };

export default function middleware(request) {
  const username = process.env.PIXEL_SITE_USER || 'pixel';
  const password = process.env.PIXEL_SITE_PASSWORD;
  if (!password) return new Response('Acesso bloqueado: configure PIXEL_SITE_PASSWORD no Vercel.', { status: 503 });

  const authorization = request.headers.get('authorization') || '';
  const encoded = authorization.match(/^Basic\s+(.+)$/i)?.[1];
  if (encoded) {
    try {
      const supplied = Buffer.from(encoded, 'base64').toString('utf8');
      const expected = `${username}:${password}`;
      const a = Buffer.from(supplied);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return next();
    } catch {
      // Responde com o mesmo desafio para credenciais malformadas.
    }
  }

  return new Response('Autenticação necessária.', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="PIXEL AI STUDIO", charset="UTF-8"', 'cache-control': 'no-store' },
  });
}
