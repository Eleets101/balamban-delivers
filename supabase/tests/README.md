# Database security tests

`order_security.test.sql` checks the access, order-transition and payout rules in
`supabase/pending/20261021_secure_order_lifecycle.sql` (see run output for count).

It runs on a throwaway in-memory Postgres (PGlite) and never touches the real database:

```bash
mkdir -p /tmp/pgtest && cd /tmp/pgtest && echo '{}' > package.json && bun add @electric-sql/pglite
cp /dev-server/supabase/tests/run.ts . && bun run.ts           # migrations + pending + tests
bun run.ts baseline                                             # current rules only (shows today's defects)
bun run.ts rollback                                             # also checks the rollback script applies
cp /dev-server/supabase/tests/rollback_diff.ts . && bun rollback_diff.ts   # proves rollback restores exact policies/functions/triggers/grants
```
