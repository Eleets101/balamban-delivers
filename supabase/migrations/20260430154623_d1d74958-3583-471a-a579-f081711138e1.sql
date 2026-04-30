REVOKE ALL ON FUNCTION public.create_ledger_for_completed_order() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_ledger_for_completed_order() FROM anon;
REVOKE ALL ON FUNCTION public.create_ledger_for_completed_order() FROM authenticated;
REVOKE ALL ON FUNCTION public.create_ledger_for_completed_order() FROM service_role;