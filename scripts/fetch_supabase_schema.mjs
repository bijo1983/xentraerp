#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  OUTPUT = 'supabase/migrations/20251010211230_create_recent_database_changes_function.sql'
} = process.env;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL environment variable.');
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_ANON_KEY environment variable.');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

async function fetchText(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed for ${path}: ${response.status} ${response.statusText}\n${body}`);
  }
  return response.text();
}

async function fetchJson(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed for ${path}: ${response.status} ${response.statusText}\n${body}`);
  }
  return response.json();
}

function renderDefinitions(rows, field = 'definition') {
  return rows
    .map((row) => row[field])
    .filter(Boolean)
    .join('\n\n');
}

async function main() {
  const pieces = [];

  pieces.push('-- ============================================================');
  pieces.push('-- Auto-generated Supabase schema dump via pg_meta endpoints');
  pieces.push('-- Do not edit manually. Run scripts/fetch_supabase_schema.mjs');
  pieces.push('-- ============================================================');
  pieces.push('');

  try {
    const schemaSql = await fetchText('pg_meta/schema_sql');
    pieces.push('-- Schema');
    pieces.push(schemaSql.trim());
    pieces.push('');
  } catch (error) {
    console.error('Failed to fetch schema_sql from pg_meta:', error.message);
    throw error;
  }

  try {
    const policies = await fetchJson('pg_meta/policies?select=definition');
    if (policies.length) {
      pieces.push('-- Policies');
      pieces.push(renderDefinitions(policies));
      pieces.push('');
    }
  } catch (error) {
    console.warn('Unable to fetch policies via pg_meta:', error.message);
  }

  try {
    const functions = await fetchJson('pg_meta/functions?select=definition');
    if (functions.length) {
      pieces.push('-- Functions');
      pieces.push(renderDefinitions(functions));
      pieces.push('');
    }
  } catch (error) {
    console.warn('Unable to fetch functions via pg_meta:', error.message);
  }

  pieces.push('-- Custom helper remains appended after remote introspection.');
  pieces.push("\n-- TODO: append additional custom SQL (e.g., get_recent_database_changes)");

  const outputPath = OUTPUT;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pieces.join('\n'));
  console.log(`Wrote schema snapshot to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
