ALTER TABLE `authorization_spaces` ADD `onboarding_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `authorization_spaces` ADD `onboarding_allowed_triggers` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `authorization_spaces`
SET `onboarding_allowed_triggers` = '[]'
WHERE CASE
  WHEN `onboarding_allowed_triggers` IS NULL THEN 1
  WHEN json_valid(`onboarding_allowed_triggers`) = 0 THEN 1
  WHEN json_type(`onboarding_allowed_triggers`) != 'array' THEN 1
  ELSE 0
END = 1;
