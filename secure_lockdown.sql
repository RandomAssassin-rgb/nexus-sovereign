-- NEXUS SOVEREIGN: PRODUCTION SECURITY HARDENING
-- Enable RLS and restrict all public access. 
-- Since the frontend now uses the Backend Proxy, we can safely lock these tables.

-- 1. Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_plans ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing permissive policies (if any)
DROP POLICY IF EXISTS "Public Select" ON public.users;
DROP POLICY IF EXISTS "Public Select" ON public.claims;
DROP POLICY IF EXISTS "Public Select" ON public.transactions;
DROP POLICY IF EXISTS "Public Select" ON public.admin_codes;

-- 3. Implement Strict Access Policies

-- USERS: Only the service_role (backend) has access by default.
-- We do NOT add public policies here because the frontend fetches data via /api/user/sync.

-- CLAIMS: Private
-- TRANSACTIONS: Private
-- ADMIN_CODES: Private

-- NOTE: The service_role key always bypasses RLS, so the server.ts will continue to work perfectly.
-- The frontend's direct SELECTs were already removed in the previous refactor.

-- RE-AUDIT LOG:
-- After running this, test_anon_access.ts should return "Permission Denied" for every table.
