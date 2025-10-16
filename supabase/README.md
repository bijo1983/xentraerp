# Supabase Schema Synchronization

This project now relies on the live Supabase project (`ikadkbzaeqqtamnkgowu`) as the single source of truth for tables, policies, and database helpers.  Rather than manually copying definitions into migrations, you can regenerate the SQL snapshot straight from the hosted database.

## Prerequisites

1. **Supabase URL** – the project URL, e.g. `https://ikadkbzaeqqtamnkgowu.supabase.co`.
2. **Anon Key** – export the anonymous key for the project and expose it as an environment variable.  For example:

   ```bash
   export SUPABASE_URL="https://ikadkbzaeqqtamnkgowu.supabase.co"
   export SUPABASE_ANON_KEY="<your-anon-key>"
   ```

   > ⚠️ The pg_meta endpoints that expose schema metadata typically require elevated privileges.  If the anon key does not have access, request a service role key from the project owner and set `SUPABASE_ANON_KEY` to that value instead.

## Regenerating the schema snapshot

Run the helper script to pull the schema, policies, and function definitions via the Supabase `pg_meta` REST endpoints:

```bash
npm run supabase:pull
```

The script writes to `supabase/migrations/20251010211230_create_recent_database_changes_function.sql` by default.  Override the destination with the `OUTPUT` environment variable if you need to store the export elsewhere:

```bash
OUTPUT=supabase/migrations/latest.sql npm run supabase:pull
```

The script overwrites the target file with the definitions returned by Supabase.  Commit the regenerated SQL to keep the repository in sync with the remote database.

## Updating custom helpers

After regenerating the base schema, append any local helpers (such as `get_recent_database_changes`) to the migration file so that bespoke logic remains alongside the introspected dump.

