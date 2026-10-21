# Audit result: add a required contact phone number to Padala, Pabili and manual Food orders

## Finding
- The Food cart (restaurant ordering) asks for a phone number, fills it in from the customer's profile, and won't submit without one.
- The shared order form used for **Padala (parcels), Pabili, and the manual food request** has **no phone field at all**. Riders get an address, a map pin and an optional note, but no reliable number to call.
- In Balamban, many places have no street numbers (the form itself says this). When a rider can't find the pickup or drop-off and can't call anyone, the delivery fails. This is the most likely reason a delivery doesn't get finished, and it's a small, contained fix.

## Change (one form, three services)
1. Add a required **"Contact phone number"** field to the shared order form, just above "Notes for rider".
2. Fill it in automatically from the customer's saved profile phone, the same way the Food cart does.
3. Block submission with a clear message if it's empty or not a valid PH mobile number (09xxxxxxxxx or +639xxxxxxxxx).
4. For Padala only, add an optional **"Recipient name & phone"** field, because the person receiving the parcel is often not the customer.
5. Save the numbers with the order details (same place the Food cart already saves them), so riders and admins can see them without any database change.

## Affected screens / files
- Padala, Pabili, manual Food request screens, through `src/components/OrderForm.tsx` (the only file that must change).
- Optional follow-up: check that the rider's order view (`src/routes/driver.tsx`, `src/components/OrderTracker.tsx`) shows the phone as a tap-to-call link. Whether it already reads `details.phone` hasn't been checked yet.

## Customer benefit
- Riders can call when an address is unclear, so fewer deliveries fail or get cancelled.
- Parcels reach the right recipient.
- All services ask for contact info the same way.

## Risks / unknowns
- Low risk: only the form changes, with no database or pricing changes.
- Whether the rider screen shows `details.phone` today is unconfirmed (to check first during build).
- The Ride screen uses a separate form. Whether it collects a phone number wasn't audited.
- Making the field required adds one step. Pre-filling from the profile keeps that small.

## How to verify
- Signed in as a customer, open Padala: the phone field is pre-filled if the profile has one. Clear it and submit, and an error appears. Enter a valid number and submit, and checkout opens.
- In the saved order, the details include the phone (and the recipient, for Padala).
- Open the same order as a rider or admin and confirm the number is visible and can be tapped to call.
- Add a small test for the PH phone validation rule (valid and invalid formats).

## Runner-up (not in scope)
- The Food cart doesn't show the "outside service area" warning that the other services show. It's an easy follow-up.
