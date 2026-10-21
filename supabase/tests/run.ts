import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "fs";

const ROOT = "/dev-server/supabase";
const db = new PGlite();

const STUBS = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
CREATE PUBLICATION supabase_realtime;
`;

async function main() {
  await db.exec(STUBS);
  for (const f of readdirSync(`${ROOT}/migrations`).sort()) {
    try { await db.exec(readFileSync(`${ROOT}/migrations/${f}`, "utf8")); }
    catch (e) { console.log("MIGRATION FAIL", f, (e as Error).message); }
  }
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
                 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  if (process.argv[2] !== "baseline") {
    await db.exec(readFileSync(`${ROOT}/pending/20261021_secure_order_lifecycle.sql`, "utf8"));
    console.log("pending migration applied OK (scratch db)");
  }
  await db.exec(readFileSync(`${ROOT}/tests/order_security.test.sql`, "utf8"));
  const r = await db.query<{ name: string; ok: boolean; detail: string | null }>(`SELECT name, ok, detail FROM _results ORDER BY seq`);
  let fail = 0;
  for (const row of r.rows) { if (!row.ok) fail++; console.log(row.ok ? "PASS" : "FAIL", row.name, row.detail ?? ""); }
  console.log(`${r.rows.length - fail}/${r.rows.length} passed`);
  if (process.argv[2] === "rollback") {
    await db.exec(readFileSync(`${ROOT}/pending/20261021_secure_order_lifecycle.rollback.sql`, "utf8"));
    console.log("rollback applied OK");
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("ERROR", e.message); process.exit(2); });
