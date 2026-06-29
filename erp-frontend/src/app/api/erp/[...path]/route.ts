import { NextRequest, NextResponse } from 'next/server';

const ERP_URL = 'http://127.0.0.1:8001';
const ERP_HOST = 'erp.badmintonbooking.com';

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const apiPath = params.path.join('/');
  const url = `${ERP_URL}/api/${apiPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Host: ERP_HOST,
  };

  const cookie = req.headers.get('cookie');
  if (cookie) headers['Cookie'] = cookie;

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text();
    if (body) fetchOptions.body = body;
  }

  try {
    const res = await fetch(url, fetchOptions);
    const data = await res.text();

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', res.headers.get('Content-Type') || 'application/json');

    const setCookie = res.headers.getSetCookie?.() || [];
    for (const c of setCookie) {
      responseHeaders.append('Set-Cookie', c);
    }

    return new NextResponse(data, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
