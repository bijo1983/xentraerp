import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import { resolveTenant } from './registry';

function tenantSlug(req: NextRequest): string | undefined {
  return req.headers.get('x-xentra-tenant') || req.cookies.get('xentra_tenant')?.value || undefined;
}

// Streams a file straight from the tenant's Frappe site (public /files/... or
// authenticated /private/files/...) back to the browser as raw bytes. Used by
// the /files and /private/files catch-all routes so an <img>/<a> pointing at
// a file_url returned from upload_file actually resolves to something —
// there was previously no route at all for these paths, so any attach/image
// field value was unviewable even once uploaded.
export async function proxyFile(req: NextRequest, backendPath: string): Promise<NextResponse> {
  const tenant = await resolveTenant(tenantSlug(req));
  const { hostIp, port, host } = tenant.backend;
  const cookie = req.headers.get('cookie');

  return new Promise<NextResponse>((resolve) => {
    const proxyReq = http.request(
      {
        hostname: hostIp,
        port,
        path: backendPath,
        method: 'GET',
        headers: { Host: host, ...(cookie ? { Cookie: cookie } : {}) },
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const data = Buffer.concat(chunks);
          const headers = new Headers();
          headers.set('Content-Type', (proxyRes.headers['content-type'] as string) || 'application/octet-stream');
          const disposition = proxyRes.headers['content-disposition'];
          if (disposition) headers.set('Content-Disposition', disposition as string);
          resolve(new NextResponse(data, { status: proxyRes.statusCode || 200, headers }));
        });
      }
    );
    proxyReq.on('error', () => resolve(NextResponse.json({ error: 'Backend unavailable' }, { status: 502 })));
    proxyReq.end();
  });
}
