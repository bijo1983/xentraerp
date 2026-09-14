import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import { resolveTenant } from '@/lib/tenancy/registry';

function tenantSlug(req: NextRequest): string | undefined {
  return req.headers.get('x-xentra-tenant') || req.cookies.get('xentra_tenant')?.value || undefined;
}

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const tenant = await resolveTenant(tenantSlug(req));
  const { hostIp, port, host } = tenant.backend;

  const methodPath = params.path.map((seg) => encodeURIComponent(seg)).join('/');
  const search = req.nextUrl.search || '';
  const path = `/api/method/${methodPath}${search}`;

  // Raw bytes, not text — a text round-trip would corrupt multipart file
  // uploads (upload_file) and any binary response (PDFs, images).
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.from(await req.arrayBuffer()) : undefined;
  const cookie = req.headers.get('cookie');

  const contentType = req.headers.get('content-type') || 'application/json';
  const reqHeaders: Record<string, string | number> = {
    'Content-Type': contentType,
    Accept: 'application/json',
    Host: host,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body && body.length ? { 'Content-Length': body.length } : {}),
  };

  return new Promise<NextResponse>((resolve) => {
    const proxyReq = http.request({ hostname: hostIp, port, path, method: req.method, headers: reqHeaders }, (proxyRes) => {
      const chunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const data = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', (proxyRes.headers['content-type'] as string) || 'application/json');
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          for (const c of setCookie) {
            // Strip Domain so the browser stores the cookie for the frontend origin
            const stripped = c.replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax');
            responseHeaders.append('Set-Cookie', stripped);
          }
        }
        resolve(new NextResponse(data, { status: proxyRes.statusCode || 200, headers: responseHeaders }));
      });
    });
    proxyReq.on('error', () => resolve(NextResponse.json({ error: 'Backend unavailable' }, { status: 502 })));
    if (body && body.length) proxyReq.write(body);
    proxyReq.end();
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
