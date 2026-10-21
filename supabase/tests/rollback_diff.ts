// Proves the rollback restores the exact current policies, functions and triggers.
// Scratch PGlite only. Usage: cd /tmp/pgtest && bun /dev-server/supabase/tests/rollback_diff.ts
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "fs";

const ROOT = "/dev-server/supabase";
const STUBS = readFileSync(`${ROOT}/tests/run.ts`, "utf8").match(/const STUBS = `([\s\S]*?)`;/)![1];

const SNAP = `
SELECT 'policy' k, tablename || ':' || policyname n,
  cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') v
FROM pg_policies WHERE schemaname IN ('public', 'storage')
UNION ALL
SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public'
UNION ALL
SELECT 'trigger', c.relname || ':' || t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'grant', table_name || ':' || grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
FROM information_schema.role_table_grants WHERE table_schema = 'public' GROUP BY table_name, grantee
ORDER BY 1, 2`;

async function snap(db: PGlite) {
  const r = await db.query<{ k: string; n: string; v: string }>(SNAP);
  return new Map(r.rows.map((x) => [`${x.k} ${x.n}`, x.v]));
}

const db = new PGlite();
await db.exec(STUBS);
for (const f of readdirSync(`${ROOT}/migrations`).sort()) await db.exec(readFileSync(`${ROOT}/migrations/${f}`, "utf8"));
await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;`);
const before = await snap(db);
await db.exec(readFileSync(`${ROOT}/pending/20261021_secure_order_lifecycle.sql`, "utf8"));
const during = await snap(db);
await db.exec(readFileSync(`${ROOT}/pending/20261021_secure_order_lifecycle.rollback.sql`, "utf8"));
const after = await snap(db);

const diff = (a: Map<string, string>, b: Map<string, string>) => {
  const out: string[] = [];
  for (const [k, v] of a) if (!b.has(k)) out.push(`- ${k}`); else if (b.get(k) !== v) out.push(`~ ${k}\n    was: ${v}\n    now: ${b.get(k)}`);
  for (const k of b.keys()) if (!a.has(k)) out.push(`+ ${k}`);
  return out;
};
console.log("== migration changes ==");
console.log(diff(before, during).join("\n"));
const residual = diff(before, after);
console.log("== after rollback vs original ==");
console.log(residual.length ? residual.join("\n") : "IDENTICAL");
process.exit(residual.length ? 1 : 0);
