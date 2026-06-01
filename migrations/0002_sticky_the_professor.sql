ALTER TABLE `deployments` ADD `env_vars` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `deployments` ADD `health_check_path` text;