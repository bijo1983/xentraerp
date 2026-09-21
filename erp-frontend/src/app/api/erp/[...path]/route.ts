import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import { resolveTenant } from '@/lib/tenancy/registry';
import { toBackendMethod, scrubErrorBody } from '@/lib/method-alias';

function tenantSlug(req: NextRequest): string | undefined {
  return req.headers.get('x-xentra-tenant') || req.cookies.get('xentra_tenant')?.value || undefined;
}

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const tenant = await resolveTenant(tenantSlug(req));
  const { hostIp, port, host } = tenant.backend;

  // `method/<name>` calls use the public `xentraerp.*` alias, translated before forwarding.
  const apiPath = params.path
    .map((segment, i) => encodeURIComponent(params.path[0] === 'method' && i === 1 ? toBackendMethod(segment) : segment))
    .join('/');
  const search = req.nextUrl.search || '';
  const path = `/api/${apiPath}${search}`;

  // Raw bytes, not text — a text round-trip would corrupt binary bodies
  // (file uploads, PDFs, images) even though it happens to work for JSON.
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.from(await req.arrayBuffer()) : undefined;

  const cookie = req.headers.get('cookie');

  const reqHeaders: Record<string, string | number> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
    Accept: 'application/json',
    Host: host,
    // The real client, as nginx saw it. Sent to the backend as the request's
    // origin so per-visitor protections (e.g. the POS PIN lockout) key on the
    // visitor, not on this proxy's loopback address. Taken from X-Real-IP,
    // which nginx always overwrites, never from a client-suppliable
    // X-Forwarded-For.
    ...(req.headers.get('x-real-ip') ? { 'X-Forwarded-For': req.headers.get('x-real-ip') as string } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body && body.length ? { 'Content-Length': body.length } : {}),
  };
  console.log('[erp-proxy] ->', req.method, `${hostIp}:${port}${path}`, JSON.stringify(reqHeaders));

  return new Promise<NextResponse>((resolve) => {
    const proxyReq = http.request(
      {
        hostname: hostIp,
        port,
        path,
        method: req.method,
        headers: reqHeaders,
      },
      (proxyRes) => {
        console.log('[erp-proxy] <-', proxyRes.statusCode, JSON.stringify(proxyRes.headers));
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          let data = Buffer.concat(chunks);

          if ((proxyRes.statusCode || 0) >= 400) {
            console.error('[erp-proxy] ERROR body', proxyRes.statusCode, path, data.slice(0, 1500).toString('utf-8'));
          }

          if ((proxyRes.statusCode || 0) >= 400) data = scrubErrorBody(data, proxyRes.headers['content-type'] as string | undefined);

          const responseHeaders = new Headers();
          responseHeaders.set(
            'Content-Type',
            (proxyRes.headers['content-type'] as string) || 'application/json'
          );

          const setCookie = proxyRes.headers['set-cookie'];
          if (setCookie) {
            for (const c of setCookie) {
              responseHeaders.append('Set-Cookie', c);
            }
          }

          resolve(
            new NextResponse(data, {
              status: proxyRes.statusCode || 200,
              headers: responseHeaders,
            })
          );
        });
      }
    );

    proxyReq.on('error', () => {
      resolve(NextResponse.json({ error: 'Backend unavailable' }, { status: 502 }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
