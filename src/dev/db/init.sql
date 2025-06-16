-- This guarantees the role is created
DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD 'postgres';
END IF;
END
$$;
