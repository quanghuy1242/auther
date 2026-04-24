ALTER TABLE `webhook_endpoint` ADD `client_id` text REFERENCES oauth_application(client_id) ON DELETE set null;
