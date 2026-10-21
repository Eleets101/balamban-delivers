# HatodGo production-readiness audit

Read-only audit of the code, access rules and tests. Nothing was changed. "Confirmed" means the code or the access rules show the problem directly. "Likely" means it follows from those rules but was not run with a real account.

## Critical: blocks launch

1. **Every rider can read every customer's order, including phone numbers and addresses (Confirmed).** The `orders` rule "Riders view assigned orders" allows `rider_id = auth.uid() OR has_role(rider)`. This means any rider can see all orders: other riders' trips, finished orders, and the customer and recipient phone numbers saved in `details` in the last update. Fix: riders see only pending orders with contact details hidden, or their own assigned orders.
2. **Riders cannot accept or move trips forward (Likely; very probable).** `driver.tsx:274/286/307` updates `orders` straight from the app, but `orders` has no rule that lets riders change orders. Only admins and customers with pending orders can. Accepting a trip, changing trip stages and completing a trip will fail or change nothing. Completed trips create the money records, so the wallet and finance pages stay empty. This probably explains the earlier "dashboard is empty" reports.
3. **Customers can mark their own order as paid (Confirmed).** `checkout.$orderId.pay.tsx:68` sets `payment_status: "paid"` from the app, and the customer update rule allows it. No payment provider confirms the payment. GCash and Maya "payments" are effectively self-reported.
4. **Customers can create or change orders with any price or status (Confirmed).** The rules "Customers create orders" and "Customers update own pending orders" check only who owns the order. A customer can insert an order already set to `completed`, with any `rider_id`, `estimated_price` or `payment_status`. That fires the money trigger and creates fake ledger entries for a rider.
5. **Customer cancel probably fails (Likely).** `CancelOrderDialog.tsx:112` changes the status to `cancelled`. The update rule only accepts changes that leave the order `pending`, so the database should reject the change.
6. **Protected server actions are missing the sign-in token (Confirmed).** There is no `src/start.ts`, so nothing attaches the user's token. The restaurant import, CSV import, bulk publish and dev simulator actions all require sign-in, so they will fail with "unauthorized" for everyone, admins included.

## High

7. **Riders and customers can't see each other's names (Confirmed).** `profiles` can only be read by the owner and admins. The rider's customer-name lookup and `RiderInfoCard` (customer sees rider) both return nothing, so the pages show placeholders.
8. **There is no rider onboarding (Confirmed).** New sign-ups get only the `customer` role (`handle_new_user`). Rider roles are given by hand in `admin.tsx:155`. There is no application, ID check, vehicle record or approval step.
9. **The dev simulator has no server-side check (Confirmed).** `src/server/devSimulator.ts` checks sign-in, but not dev mode or admin role. The panel is hidden in the live app, but any signed-in user who calls the action directly can make themselves the rider and fake GPS on their own orders.
10. **Riders can edit pending payout requests (Confirmed).** The rule "Riders update own pending settlements" has no extra check, so a rider can change `amount`, `type` or `receipt_url` before admin review.
11. **Refunds don't exist (Confirmed).** Nothing records refunds or reverses the ledger. Cancelling an order after "paid" leaves the payment status unchanged.
12. **Proof of delivery is missing (Confirmed).** Search found no photo or signature step at completion.
13. **The leaked Google API key (Unverified).** The key pasted in chat earlier must be rotated in Google Cloud. I can't confirm whether it was.

## Medium

- Rider and customer "vehicle / 4.9 rating" are hardcoded placeholders. This misleads customers.
- Service zones are rough circles (`serviceArea.ts`), and customers outside them can still order.
- The ride form doesn't use the new required phone field.
- `capacitor.config.ts` still points `server.url` at the live preview and uses the placeholder `appId`. App stores will reject this.
- The rider list of available orders shows pending orders, and the 30-second countdown runs only on the rider's phone. The server never expires or reassigns orders.
- Restaurant hours use `open_time`/`close_time`, but the admin form can't edit them yet.
- Trip stage is saved in `details.trip_stage`, and riders can't write it (see item 2).

## Low

- Only one test file exists (`src/lib/phone.test.ts`). Nothing tests pricing, fees, wallet maths or access rules.
- The sample-data mode on the finance page is browser-only. That's fine, but label it clearly on screen.

## What cannot be verified without real credentials or accounts

- Real GCash or Maya payments, refunds and payouts: no provider is connected.
- Rider, customer and admin flows end to end: these need three test accounts with the right roles, and there are currently no rider accounts.
- Native iOS/Android builds and store review: these need Apple and Google accounts plus Codemagic.
- Real GPS accuracy, background location and push notifications on phones.
- Whether the Google key was rotated.

## Staged fix plan (each stage tested before the next)

**Stage 1: lock down data (database rules only)**
- Split the rider rule on `orders`: riders see `pending` orders with no assigned rider through a safe view or function that leaves out contact details, plus their own assigned orders in full.
- Replace the customer insert and update rules. Customers create orders only as `pending`, with no rider and `payment_status` pending or cod. Customers may cancel only their own pending orders.
- Add rider-only database functions `accept_order(id)` (claims the order only while it is still pending and unassigned), `advance_trip(id, stage)` and `complete_order(id)`, instead of direct table updates.
- Add a limited "contact card" function so a customer can see their assigned rider's name and phone, and the assigned rider can see the customer's, only while the order is active.
- Riders may update their own pending payout requests only to cancel them; amount and type can't change.

**Stage 2: make the app work with the new rules**
- Add `src/start.ts` so protected server actions get the sign-in token.
- Change `driver.tsx` to use the new accept, advance and complete functions.
- Allow the dev simulator only to admins, and block it in the live app.
- Mark GCash/Maya as "awaiting confirmation" instead of "paid". Admins confirm payments manually until a real provider is connected.

**Stage 3: operations features**
- Rider application and admin approval.
- A proof-of-delivery photo stored privately.
- Admin refunds and order cancellation that also reverse the money records.
- Server-side expiry for pending orders that no rider accepts.

**Stage 4: app store readiness**
- Remove `server.url`, set a real bundle ID, add the phone field to the ride form, remove the fake rating and vehicle.

## Tests to add

- Access tests written as SQL scripts run against test users. A rider can't read another rider's order or a customer's phone. A customer can't insert a `completed` order or set it `paid`. Two riders accepting at once: only one wins.
- Unit tests for the delivery fee, service fee (8%, min 8, max 30), fare and commission/balance maths in `wallet.ts`.
- One end-to-end script with test accounts: customer orders → rider accepts → completes → ledger row → rider balance shows on the admin finance page.

## Technical notes

Evidence: the `orders` policies (listed above); `driver.tsx` lines 274/286/307; `checkout.$orderId.pay.tsx:56/68`; `CancelOrderDialog.tsx:112`; `src/start.ts` missing; `devSimulator.ts` (sign-in only); `handle_new_user` in the first migration; `capacitor.config.ts` lines 17/23. Stage 1 is additive (new functions and replaced rules) and changes no existing records.
