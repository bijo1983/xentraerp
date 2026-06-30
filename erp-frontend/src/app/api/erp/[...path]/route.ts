import { NextRequest, NextResponse } from 'next/server';
import http from 'http';

const ERP_HOST_IP = '127.0.0.1';
const ERP_PORT = 8001;
const ERP_HOST = 'erp.badmintonbooking.com';

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const apiPath = params.path.join('/');
  const search = req.nextUrl.search || '';
  const path = `/api/${apiPath}${search}`;

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

  const cookie = req.headers.get('cookie');

  return new Promise<NextResponse>((resolve) => {
    const proxyReq = http.request(
      {
        hostname: ERP_HOST_IP,
        port: ERP_PORT,
        path,
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Host: ERP_HOST,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');

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
