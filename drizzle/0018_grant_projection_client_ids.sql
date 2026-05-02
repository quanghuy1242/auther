ALTER TABLE `oauth_client_metadata`
ADD COLUMN `grant_projection_client_ids` text NOT NULL DEFAULT '[]';
