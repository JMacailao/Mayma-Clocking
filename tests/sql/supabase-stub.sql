-- The parts of Supabase the setup files expect, for testing them on a plain
-- PostgreSQL database: roles, auth.users / auth.identities, auth.uid(),
-- pgcrypto in the extensions schema and the realtime publication.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text, is_sso_user boolean DEFAULT false);
CREATE TABLE auth.identities (id uuid DEFAULT gen_random_uuid(), provider_id text, user_id uuid, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE PUBLICATION supabase_realtime;
