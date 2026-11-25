-- Up Migration
ALTER TABLE web.tenant ADD COLUMN slug text NOT NULL DEFAULT ('tenant-' || left(replace(gen_random_uuid()::text,'-',''),12));
ALTER TABLE web.workspace ADD COLUMN slug text NOT NULL DEFAULT ('space-' || left(replace(gen_random_uuid()::text,'-',''),12));
UPDATE web.tenant SET slug='yuanshan' WHERE id='99500000-0000-4000-8000-000000000010';
UPDATE web.tenant SET slug='xinghe' WHERE id='99500000-0000-4000-8000-000000000011';
UPDATE web.workspace SET slug='zongbu' WHERE id='99500000-0000-4000-8000-000000000020';
UPDATE web.workspace SET slug='huadong' WHERE id='99500000-0000-4000-8000-000000000021';
UPDATE web.workspace SET slug='dianshang' WHERE id='99500000-0000-4000-8000-000000000022';
ALTER TABLE web.tenant ADD CONSTRAINT tenant_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]{1,31}$'), ADD CONSTRAINT tenant_slug_unique UNIQUE(slug);
ALTER TABLE web.workspace ADD CONSTRAINT workspace_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]{1,31}$'), ADD CONSTRAINT workspace_slug_unique UNIQUE(tenant_id,slug);
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Restore a verified backup to recover; down migration is disabled'; END $$;
