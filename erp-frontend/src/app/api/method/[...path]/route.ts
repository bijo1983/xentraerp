import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.ERP_BACKEND_URL || 'http://127.0.0.1:8001';
const HOST = process.env.ERP_BACKEND_HOST || 'erp.badmintonbooking.com';

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const search = req.nextUrl.search;
  const url = `${BACKEND}/api/method/${path}${search}`;

  const headers = new Headers(req.headers);
  headers.set('host', HOST);
  headers.delete('content-length'); // let fetch recalculate

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined;

  const res = await fetch(url, {
    method: req.method,
    headers,
    body,
    // @ts-expect-error Node fetch option
    duplex: 'half',
  });

  const resHeaders = new Headers(res.headers);
  resHeaders.delete('content-encoding'); // avoid double-decompression after Node auto-decompresses
  resHeaders.delete('content-length');   // compressed length no longer matches decompressed body

  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
