ALTER TABLE `access_tuples` ADD `authorization_space_id` text REFERENCES authorization_spaces(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `access_tuples_authorization_space_idx` ON `access_tuples` (`authorization_space_id`);--> statement-breakpoint
UPDATE `access_tuples`
SET `authorization_space_id` = (
  SELECT `authorization_models`.`authorization_space_id`
  FROM `authorization_models`
  WHERE `authorization_models`.`id` = `access_tuples`.`entity_type_id`
)
WHERE `entity_type_id` IS NOT NULL
  AND `authorization_space_id` IS NULL;
