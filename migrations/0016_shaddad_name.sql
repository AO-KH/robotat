-- The platform robot gets its name: Shaddad in English, شداد in Arabic.
--
-- `name` was one untranslated brand string ("MAX T100") shown to both languages.
-- A name that differs by script needs the same bilingual split role_en/role_ar
-- already has, so `name` keeps the English rendering and `name_ar` carries the
-- Arabic one. NULL name_ar means "reads the same in both languages", which is
-- what the X-* attachment brands want — the client falls back to `name`.
--
-- The catalogue is live data ("editable in the DB thereafter" — 0004), so the
-- rename must reach the rows themselves, not just the seed file. replace() on
-- the descriptions catches the attachments' "mounts to the MAX T100" sentences
-- in whatever state staff have edited them into, rather than overwriting whole
-- descriptions with the seed's text.
ALTER TABLE "products" ADD COLUMN "name_ar" text;--> statement-breakpoint
UPDATE "products" SET "name" = 'Shaddad', "name_ar" = 'شداد' WHERE "slug" = 'max-t100';--> statement-breakpoint
UPDATE "products" SET
  "description_en" = replace("description_en", 'MAX T100', 'Shaddad'),
  "description_ar" = replace("description_ar", 'MAX T100', 'شداد');
