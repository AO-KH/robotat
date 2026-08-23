-- The attachments get their Arabic names, the way the platform got شداد (0016):
-- الجزازة for the grass cutter, الحراثة for the cultivator, and الرشاش الموجه
-- for the sprayer. `name` keeps the English X-* branding; name_ar carries the
-- Arabic rendering the client shows under lang=ar. Data-only — no schema change.
UPDATE "products" SET "name_ar" = 'الجزازة' WHERE "slug" = 'x-grass-cutter';--> statement-breakpoint
UPDATE "products" SET "name_ar" = 'الحراثة' WHERE "slug" = 'x-cultivator';--> statement-breakpoint
UPDATE "products" SET "name_ar" = 'الرشاش الموجه' WHERE "slug" = 'x-sprayer';
