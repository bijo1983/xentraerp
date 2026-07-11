import { NextRequest, NextResponse } from 'next/server';

// ── AI enrichment endpoint (Phase 1) ────────────────────────────
// Server-side only. Uses Claude when ANTHROPIC_API_KEY is configured to
// add guided questions (master) and plain-language explanations
// (transaction). It NEVER writes documents — it returns advisory text
// that the client shows alongside the deterministic suggestions. With no
// key it returns { enabled:false } and the UI uses the deterministic core.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

interface Body {
  mode: 'master' | 'transaction';
  doctype: string;
  intent?: string;
  answers?: Record<string, unknown>;
  fields?: { fieldname: string; label: string; reqd?: boolean; options?: string }[];
  doc?: Record<string, unknown>;
  issues?: { field: string; message: string }[];
  ctx?: { company?: string | null; currency?: string | null; country?: string | null };
}

const SYSTEM = `You are XentraERP's data assistant. You ONLY propose guided questions and plain-language explanations for ERP records. You must NEVER instruct to save or submit, and never invent Link values. Respond in STRICT JSON only, matching the requested schema. Keep it concise and practical.`;

function masterPrompt(b: Body) {
  return `DocType: ${b.doctype}
Company context: ${JSON.stringify(b.ctx || {})}
User intent: ${b.intent || '(none given)'}
Known answers: ${JSON.stringify(b.answers || {})}
Fields (fieldname, label, required, options): ${JSON.stringify((b.fields || []).slice(0, 60))}
Task: Return up to 5 concise guided questions for the mandatory/high-value fields still missing, and a one-line tip.
JSON schema: {"questions":[{"field":string,"text":string}],"tip":string}`;
}

function txnPrompt(b: Body) {
  return `DocType: ${b.doctype}
Draft (trimmed): ${JSON.stringify(b.doc || {}).slice(0, 4000)}
Detected issues: ${JSON.stringify(b.issues || [])}
Task: For each issue, give a short business-friendly explanation of WHY it matters and how to fix it. Add one overall tip.
JSON schema: {"explanations":[{"field":string,"why":string}],"tip":string}`;
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ enabled: false, reason: 'No AI key configured; using built-in suggestions.' });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ enabled: false, reason: 'Bad request.' }, { status: 400 });
  }

  const prompt = body.mode === 'master' ? masterPrompt(body) : txnPrompt(body);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ enabled: false, reason: `AI provider error (${res.status}).` });
    }
    const data = await res.json();
    const text: string = data?.content?.[0]?.text || '{}';
    // Guardrail: parse strictly; drop anything that isn't the expected shape.
    let parsed: Record<string, unknown> = {};
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      parsed = {};
    }
    return NextResponse.json({ enabled: true, model: MODEL, ...parsed });
  } catch {
    // Network/timeout → graceful fallback to deterministic core.
    return NextResponse.json({ enabled: false, reason: 'AI provider unreachable; using built-in suggestions.' });
  }
}
