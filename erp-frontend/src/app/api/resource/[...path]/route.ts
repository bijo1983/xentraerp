import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import { resolveTenant } from '@/lib/tenancy/registry';

function tenantSlug(req: NextRequest): string | undefined {
  return req.headers.get('x-xentra-tenant') || req.cookies.get('xentra_tenant')?.value || undefined;
}

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const tenant = await resolveTenant(tenantSlug(req));
  const { hostIp, port, host } = tenant.backend;

  const resourcePath = params.path.join('/');
  const search = req.nextUrl.search || '';
  const path = `/api/resource/${resourcePath}${search}`;

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;
  const cookie = req.headers.get('cookie');

  const reqHeaders: Record<string, string | number> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Host: host,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
  };

  return new Promise<NextResponse>((resolve) => {
    const proxyReq = http.request({ hostname: hostIp, port, path, method: req.method, headers: reqHeaders }, (proxyRes) => {
      const chunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', (proxyRes.headers['content-type'] as string) || 'application/json');
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          for (const c of setCookie) responseHeaders.append('Set-Cookie', c);
        }
        resolve(new NextResponse(data, { status: proxyRes.statusCode || 200, headers: responseHeaders }));
      });
    });
    proxyReq.on('error', () => resolve(NextResponse.json({ error: 'Backend unavailable' }, { status: 502 })));
    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
