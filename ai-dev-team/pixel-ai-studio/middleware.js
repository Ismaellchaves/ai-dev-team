import { timingSafeEqual } from 'node:crypto';
import { next } from '@vercel/functions';

export const config = { runtime: 'nodejs' };

export default function middleware(request) {
  const username = process.env.PIXEL_SITE_USER || 'pixel';
  const password = process.env.PIXEL_SITE_PASSWORD;
  if (!password) {
    return new Response(
      'PIXEL AI STUDIO: falta configurar a senha de acesso. Na Vercel, abra Settings > Environment Variables, adicione PIXEL_SITE_PASSWORD para Production (e Preview, se usar) e faça um novo Deploy. A senha não deve ser enviada ao GitHub.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } },
    );
  }

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
