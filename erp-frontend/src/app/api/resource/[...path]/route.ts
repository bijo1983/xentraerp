import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import { resolveTenant } from '@/lib/tenancy/registry';

function tenantSlug(req: NextRequest): string | undefined {
  return req.headers.get('x-xentra-tenant') || req.cookies.get('xentra_tenant')?.value || undefined;
}

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const tenant = await resolveTenant(tenantSlug(req));
  const { hostIp, port, host } = tenant.backend;

  const resourcePath = params.path.map((seg) => encodeURIComponent(seg)).join('/');
  const search = req.nextUrl.search || '';
  const path = `/api/resource/${resourcePath}${search}`;

  // Read/write the body as raw bytes, not text — decoding a request or
  // response body through a UTF-8 string round-trip silently corrupts any
  // binary payload (file uploads via upload_file, downloaded attachments,
  // PDFs, images) even though it happens to work fine for JSON/text.
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.from(await req.arrayBuffer()) : undefined;
  const cookie = req.headers.get('cookie');

  const reqHeaders: Record<string, string | number> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
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
