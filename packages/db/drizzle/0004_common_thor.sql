PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_character` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`class` text,
	`level` integer DEFAULT 1 NOT NULL,
	`paragon` integer,
	`title` text,
	`portrait_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_character`("id", "user_id", "name", "class", "level", "paragon", "title", "portrait_key", "created_at", "updated_at") SELECT "id", "user_id", "name", "class", "level", "paragon", "title", "portrait_key", "created_at", "updated_at" FROM `character`;--> statement-breakpoint
DROP TABLE `character`;--> statement-breakpoint
ALTER TABLE `__new_character` RENAME TO `character`;--> statement-breakpoint
PRAGMA foreign_keys=ON;