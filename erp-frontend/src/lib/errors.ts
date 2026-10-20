// Turns a failed backend response into the sentence the user should read.
//
// The backend puts the readable reason in `_server_messages` (a JSON list of
// JSON-encoded {message} objects, often with HTML), and the raw exception
// ("xentraerp.exceptions.ValidationError: ...") in `exception`. Showing the
// raw exception — what forms did until now — reads like a crash.
interface ErrorBody {
  _server_messages?: string;
  exception?: string;
  message?: unknown;
  exc_type?: string;
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function serverMessage(data?: ErrorBody | null): string | null {
  if (!data) return null;
  try {
    if (data._server_messages) {
      const msgs = (JSON.parse(data._server_messages) as string[])
        .map((m) => {
          try {
            return (JSON.parse(m) as { message?: string }).message || m;
          } catch {
            return m;
          }
        })
        .map(stripHtml)
        .filter(Boolean);
      if (msgs.length) return msgs.join('\n');
    }
  } catch {
    /* fall through */
  }
  if (typeof data.exception === 'string' && data.exception) {
    return stripHtml(data.exception.split('\n')[0].replace(/^[\w.]+(Error|Exception)[\w]*:\s*/, ''));
  }
  if (typeof data.message === 'string' && data.message) return stripHtml(data.message);
  if (data.exc_type) return data.exc_type.replace(/Error$/, ' error');
  return null;
}

/** The readable reason behind a thrown fetch/axios error, falling back to `fallback`. */
export function errorText(e: unknown, fallback = 'Something went wrong.'): string {
  const err = e as { response?: { data?: ErrorBody }; body?: ErrorBody; message?: string };
  return serverMessage(err?.response?.data) || serverMessage(err?.body) || (err?.message ? stripHtml(err.message) : '') || fallback;
}

/** fetch() helper: throws an Error carrying the parsed body so errorText can read it. */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(serverMessage(data as ErrorBody) || res.statusText) as Error & { body?: ErrorBody };
    err.body = data as ErrorBody;
    throw err;
  }
  return data as Record<string, unknown>;
}
