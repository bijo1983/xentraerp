import { NextRequest } from 'next/server';
import { proxyFile } from '@/lib/tenancy/file-proxy';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const filePath = params.path.map((seg) => encodeURIComponent(seg)).join('/');
  const search = req.nextUrl.search || '';
  return proxyFile(req, `/files/${filePath}${search}`);
}
