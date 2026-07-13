-- Seed the fleet catalogue (idempotent). Editable in the DB thereafter.
INSERT INTO "products" ("slug","kind","sort_order","name","role_en","role_ar","description_en","description_ar","specs") VALUES
(
  'max-t100','platform',0,'MAX T100',
  'Heavy-Duty Autonomous Platform','منصّة ذاتية القيادة ثقيلة التحمّل',
  'The flagship autonomous robot platform. Engineered for 24/7 operations, it serves as the intelligent base for every NASL attachment — driving each row, mapping each acre, and carrying the tool the job needs.',
  'منصّة الروبوت الذاتية الرائدة. مصمّمة للعمل على مدار الساعة، وتشكّل القاعدة الذكية لكل ملحقات نصل — تجوب كل صفّ، وتمسح كل فدّان، وتحمل الأداة التي تتطلّبها المهمّة.',
  '[{"labelEn":"Power Source","labelAr":"مصدر الطاقة","valueEn":"Exclusively Electric","valueAr":"كهربائي بالكامل"},{"labelEn":"Construction","labelAr":"البُنية","valueEn":"High-Strength Steel Body","valueAr":"هيكل فولاذي عالي المتانة"},{"labelEn":"Battery","labelAr":"البطارية","valueEn":"Hot-Swappable Packs","valueAr":"حزم قابلة للتبديل السريع"},{"labelEn":"Terrain","labelAr":"التضاريس","valueEn":"Robust Multi-Terrain","valueAr":"متعدّد التضاريس ومتين"},{"labelEn":"Dimensions","labelAr":"الأبعاد","valueEn":"1.2m x 0.8m x 0.6m","valueAr":"1.2م × 0.8م × 0.6م"}]'::jsonb
),
(
  'x-grass-cutter','attachment',1,'X-Grass Cutter',
  'Management Attachment','ملحق إدارة',
  'Low-profile cutting tool for orchards and vineyards. Snaps onto the MAX T100 for uniform, autonomous maintenance.',
  'أداة قصّ منخفضة الارتفاع للبساتين والكروم. تُركّب على MAX T100 لصيانة ذاتية منتظمة.',
  '[{"labelEn":"Cutting System","labelAr":"نظام القصّ","valueEn":"Adjustable Electric Blade","valueAr":"شفرة كهربائية قابلة للتعديل"},{"labelEn":"Performance","labelAr":"الأداء","valueEn":"High-Powered Motors","valueAr":"محرّكات عالية القدرة"},{"labelEn":"Durability","labelAr":"المتانة","valueEn":"Reinforced Steel Case","valueAr":"هيكل فولاذي مُعزّز"},{"labelEn":"Control","labelAr":"التحكّم","valueEn":"Precision Height Adjustment","valueAr":"ضبط دقيق للارتفاع"},{"labelEn":"Dimensions","labelAr":"الأبعاد","valueEn":"0.9m x 0.7m x 0.4m","valueAr":"0.9م × 0.7م × 0.4م"}]'::jsonb
),
(
  'x-cultivator','attachment',2,'X-Cultivator',
  'Soil Preparation Attachment','ملحق تجهيز التربة',
  'Precision soil implement that mounts to the MAX T100. Adapts to soil density in real time for a perfect seedbed.',
  'أداة تربة دقيقة تُركّب على MAX T100. تتكيّف مع كثافة التربة لحظياً لتجهيز مهد بذور مثالي.',
  '[{"labelEn":"Sensing","labelAr":"الاستشعار","valueEn":"Real-time Soil Analysis","valueAr":"تحليل التربة الفوري"},{"labelEn":"Precision","labelAr":"الدقّة","valueEn":"Sub-inch GPS Tracking","valueAr":"تتبّع GPS دون البوصة"},{"labelEn":"Operation","labelAr":"التشغيل","valueEn":"Full Autonomous Weeding","valueAr":"إزالة أعشاب ذاتية بالكامل"},{"labelEn":"Versatility","labelAr":"المرونة","valueEn":"Modular Tool Head","valueAr":"رأس أدوات معياري"},{"labelEn":"Dimensions","labelAr":"الأبعاد","valueEn":"1.1m x 0.9m x 0.5m","valueAr":"1.1م × 0.9م × 0.5م"}]'::jsonb
),
(
  'x-sprayer','attachment',3,'X-Sprayer',
  'Targeted Application Attachment','ملحق رشّ موجّه',
  'Computer-vision guided sprayer for the MAX T100. Cuts chemical use by up to 60% through precise, plant-level application.',
  'رشّاش موجَّه بالرؤية الحاسوبية لـ MAX T100. يخفض استخدام المواد الكيميائية حتى 60٪ عبر رشّ دقيق على مستوى النبتة.',
  '[{"labelEn":"Vision","labelAr":"الرؤية","valueEn":"AI-Powered Plant Detection","valueAr":"كشف النبات بالذكاء الاصطناعي"},{"labelEn":"Efficiency","labelAr":"الكفاءة","valueEn":"60% Reduced Chemical Usage","valueAr":"خفض المواد الكيميائية 60٪"},{"labelEn":"Nozzles","labelAr":"الفوّهات","valueEn":"Individually Targeted Spray","valueAr":"رشّ موجّه فردياً"},{"labelEn":"Integration","labelAr":"التكامل","valueEn":"Live Telemetry Feed","valueAr":"بثّ بيانات مباشر"},{"labelEn":"Dimensions","labelAr":"الأبعاد","valueEn":"1.0m x 0.8m x 1.2m","valueAr":"1.0م × 0.8م × 1.2م"}]'::jsonb
)
ON CONFLICT ("slug") DO NOTHING;
