-- employee_tag_map: confidence 判决置信度。每行都是"属于"的记录,只在置信度分档。
--   'confident'  = 有把握命中(默认;存量行经 DEFAULT 自动 backfill 成 confident)。
--   'borderline' = 大概率属于但 tags.description 边界对本人临界情形没划清。
-- 证据不足 / 不属于 → 不写本表(不是 borderline)。
-- 常量 DEFAULT 是元数据变更,大表不触发重写。
ALTER TABLE "employee_tag_map" ADD COLUMN "confidence" text DEFAULT 'confident' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_tag_map" ADD CONSTRAINT "employee_tag_map_confidence_values"
  CHECK ("confidence" IN ('confident','borderline'));
