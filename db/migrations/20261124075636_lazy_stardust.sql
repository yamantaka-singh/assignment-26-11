CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`booker_json` text NOT NULL,
	`attendees_json` text NOT NULL,
	`quote_json` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_reference_unique` ON `bookings` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_idempotency_key_unique` ON `bookings` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`item_id` text PRIMARY KEY NOT NULL,
	`remaining` integer NOT NULL,
	CONSTRAINT "inventory_remaining_non_negative" CHECK("inventory"."remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`expires_at` text,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "promo_uses_within_max" CHECK("promo_codes"."max_uses" IS NULL OR "promo_codes"."uses" <= "promo_codes"."max_uses")
);
