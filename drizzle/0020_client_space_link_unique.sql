DROP INDEX IF EXISTS `oauth_client_space_links_unique_idx`;--> statement-breakpoint
DELETE FROM `oauth_client_space_links`
WHERE `id` NOT IN (
  SELECT MIN(`id`)
  FROM `oauth_client_space_links`
  GROUP BY `client_id`, `authorization_space_id`
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_client_space_links_client_space_unique`
ON `oauth_client_space_links` (`client_id`,`authorization_space_id`);
