# HatodGo pre-launch QA — 21 October 2026

## Verdict
**Do not call the app fully launch-ready yet.** The confirmed navigation/startup defects are corrected, but finance limitations below still prevent certifying owner balances as accurate across every payment channel. No publication was performed; the public site remains on the previously published code.

## Safely fixed
- Preview startup: moved restaurant import server-function module from blocked `src/server/` into `src/lib/`, updating three imports.
- Reproduced `/checkout/:id/pay` showing the order summary instead of e-wallet options. Added parent-route wrappers with Outlet for checkout outcomes, driver wallet, and restaurant management/import children. Verified e-wallet selection, success and wallet now render.
- Typed address edits now clear stale coordinates for Padala, Pabili, manual food, restaurant cart and rides; obsolete autocomplete responses are discarded.
- Missing checkout orders now show an unavailable state, not a permanent spinner.
- Removed unnecessary delayed ride navigation and false live nearby-driver count; removed invented vehicle/rating from active rider contact card.
- Rider customer calls/messages use actual tel/SMS links instead of new browser windows.
- Obsolete asynchronous role responses no longer overwrite a newer identity/sign-out.
- Checkout describes manual GCash/Maya references and no automatic charges; owner payout actions describe recording, not transmitting money. Owner payout/settlement recording requires explicit confirmation of an external payment/remittance.
- Completed leaf-page title/description/Open Graph/card metadata; removed unrelated root-level sharing images.

## Test evidence
- All app unit tests: **36/36**, five files; covers Philippine phones, payment state, reference validation, double-submit helper, identity generation, RPC forwarding for all four service types, trip/cancel/admin actions and pending/cancelled/approved payout accounting.
- Disposable PGlite SQL security checks: **96/96**. Customer isolation, sanitized job listing, assigned contacts, atomic claim conflict, forward stages, single completion ledger, immutable settlements, admin guard/audit, protected payment writes, manual food/Pabili/ride minima and Maya reference remaining unpaid.
- Rollback scratch comparison: **IDENTICAL** for policies/functions/triggers/table grants; does not restore data changed while enabled and would reopen previous unsafe policies. Not executed on shared database.
- Preview harness reports **build OK** after fixes (includes its automatic TypeScript check). No manual build/typecheck was run.
- Focused lint for auth generation/new tests: passed. Whole-project lint: **1,758 errors and nine warnings**, predominantly existing formatting; not clean. Repository-wide formatting was intentionally not performed.
- Actual signed-in read-only desktop smoke: 14 customer/rider/owner pages plus missing-order state; four phone pages at 390×844. No page exceptions or horizontal page overflow. Two attempted development-simulator mutations were intercepted and blocked before reaching shared data.
- Browser fixtures, with every Data API write and receipt upload mocked: Padala/Pabili/manual food form → checkout → Maya reference → pending readback; restaurant cart → checkout; ride → COD; stale-pin submission blocked; rider claim → arrived → pickup → completion; customer ETA/contact rendering; admin manual GCash confirmation; rider payout request remains pending → cancellation readback. **24 mocked mutations; zero page exceptions.** These prove UI wiring, not real role/provider/GPS delivery.
- Screenshots inspected: mobile Padala, mobile owner finance, e-wallet selection and cancelled payout wallet.

## Shared database read-only verification
- Reviewed live order, settlement, ledger, adjustment and role policies; direct customer/rider order mutations remain unavailable. Admin payment/fare updates are trigger-blocked, settlement/ledger mutations are not allowed directly.
- Reviewed actual order payment and completion triggers and function privileges. Order/money RPCs deny anon execution; authenticated access is intentional and their bodies check role/ownership. Linter returns 13 definer-execution warnings, not proof of an exploit: one public role helper and 12 authenticated guarded actions.
- Applied Drizzle security migration matches reviewed pending SQL byte-for-byte; no migration was applied in this QA turn.
- No shared orders/users were inserted, updated or deleted. No shared payments, payouts, receipt uploads or refunds were triggered.

## Remaining blockers / decisions
1. **Maya is classified as cash by the existing completion ledger trigger.** Confirmed in live function source. Merely choosing Maya stays unpaid, but completion currently falls into rider-collected cash. Fix requires an agreed collection convention and reviewed database change; left unchanged rather than guessing a money rule.
2. **Unconfirmed GCash completion records collection before confirmation.** The existing trigger is driven by completion, not confirmed payment. Owner dashboards can therefore imply funds were received when still pending. Needs explicit treatment of receivables/unconfirmed payments, not provider credentials.
3. **Food profit includes goods.** Owner headline computes gross customer total minus rider earnings; food goods/restaurant cost are not deducted. The separately stored company commission is not the same as net profit. Cost/restaurant settlement policy must be agreed before claiming net profit.
4. **Settlement semantics:** approval reduces payable as an externally completed payment record; there is no separate approval-versus-paid stage or verified transfer evidence. Pending remittances reduce displayed cash-held metrics before approval; manual adjustments affect net but not both directional gross debts. These were not changed because that would change accounting rules.
5. Payout request currently requires a receipt image even though a request precedes a payout; decide whether proof should be optional for requests.

## Explicit verification limits
- Existing owner-account read-only screens were checked; no production rider test account was created or selected for mutation. Rider/admin money E2E uses fixtures and SQL role tests only. Real account claim concurrency, production realtime delivery, signed receipt permissions and full reconciliation/EOD writes remain unverified against shared data.
- GPS, native background location, vibration/audio, real devices, external navigation launching and provider outages were not fully tested. ETA fixture render is not verification of a moving physical rider.
- Restaurant listing/menu live read works; checkout fixture tests do not establish live restaurant order acceptance, operating-hours enforcement or current menu validity.
- Real GCash/Maya processing, refunds and bank payouts remain **unconnected**; no credentials accessed or transfers attempted.
- Onboarding, proof of delivery, expiry, refunds and app-store readiness remain outside this focused hardening scope.

## Changed areas
`src/routes/*` metadata and the checkout/driver/restaurant wrappers; `src/components/OrderForm.tsx`, `src/components/map/PlaceAutocomplete.tsx`, `src/components/RiderInfoCard.tsx`; `src/hooks/useAuth.ts`; `src/lib/sessionGeneration*`, `src/lib/orderApi.rpc.test.ts`, `src/lib/wallet.test.ts`; restaurant import module relocation; `supabase/tests/order_security.test.sql`; `AGENTS.md`, `roadmap.md`, this report, and retained browser QA scripts in `tests/qa/`.