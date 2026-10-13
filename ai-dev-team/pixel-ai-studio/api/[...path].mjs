import { createHmac } from 'node:crypto';

export const config = { maxDuration: 60 };

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function requestBody(req) {
  if (req.body === undefined || req.body === null) return undefined;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body);
}

function signedDownload(projectId, backendUrl, secret) {
  const expires = Math.floor(Date.now() / 1000) + 90;
  const signature = createHmac('sha256', secret).update(`${projectId}.${expires}`).digest('hex');
  const target = new URL(`/api/projects/${encodeURIComponent(projectId)}/download`, backendUrl);
  target.searchParams.set('exp', String(expires));
  target.searchParams.set('sig', signature);
  return target;
}

export default async function handler(req, res) {
  const backendValue = process.env.PIXEL_BACKEND_URL;
  const secret = process.env.PIXEL_BACKEND_TOKEN;
  if (!backendValue || !secret) return json(res, 503, { error: 'Configure PIXEL_BACKEND_URL e PIXEL_BACKEND_TOKEN no Vercel.' });

  let backend;
  try {
    backend = new URL(backendValue);
    if (backend.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(backend.hostname)) throw new Error('https obrigatório');
  } catch {
    return json(res, 503, { error: 'PIXEL_BACKEND_URL deve ser uma URL HTTPS pública válida.' });
  }

  const incoming = new URL(req.url || '/', 'https://vercel.invalid');
  let backendPath;
  if (incoming.pathname.startsWith('/api/proxy/preview/')) {
    backendPath = incoming.pathname.slice('/api/proxy'.length);
  } else if (incoming.pathname.startsWith('/api/')) {
    backendPath = incoming.pathname;
  } else {
    return json(res, 404, { error: 'Rota de proxy não encontrada.' });
  }

  const download = backendPath.match(/^\/api\/projects\/([\w-]+)\/download$/);
  if (req.method === 'GET' && download) {
    res.statusCode = 302;
    res.setHeader('location', signedDownload(download[1], backend, secret).toString());
    res.setHeader('cache-control', 'no-store');
    return res.end();
  }

  const target = new URL(backendPath + incoming.search, backend);
  const headers = new Headers();
  for (const key of ['accept', 'content-type', 'if-none-match', 'if-modified-since']) {
    const value = req.headers[key];
    if (typeof value === 'string') headers.set(key, value);
  }
  headers.set('authorization', `Bearer ${secret}`);

  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : requestBody(req),
      redirect: 'manual',
      signal: AbortSignal.timeout(55_000),
    });
    res.statusCode = response.status;
    for (const key of ['content-type', 'content-disposition', 'cache-control', 'content-security-policy', 'x-content-type-options', 'etag', 'last-modified', 'location']) {
      const value = response.headers.get(key);
      if (value) res.setHeader(key, value);
    }
    if (req.method === 'HEAD' || response.status === 204 || response.status === 304) return res.end();
    const data = Buffer.from(await response.arrayBuffer());
    res.setHeader('content-length', String(data.length));
    return res.end(data);
  } catch (error) {
    console.error('Falha no proxy do PIXEL:', error?.name || 'erro de rede');
    return json(res, 502, { error: 'Não foi possível alcançar o servidor persistente do PIXEL.' });
  }
}
