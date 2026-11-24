-- Seed data lives in a migration so a deploy gets stock and promos (there is no separate seed script).
-- Literals mirror CATALOG.initialStock and PROMO_SEED; tests/seed-migration.test.ts fails if they drift.
INSERT INTO `inventory` (`item_id`, `remaining`) VALUES
	('day-adult', 380),
	('day-child', 260),
	('allday-adult', 0),
	('allday-child', 140),
	('family', 95),
	('dandiya', 900),
	('dinner', 1700),
	('garba', 2);
--> statement-breakpoint
INSERT INTO `promo_codes` (`code`, `kind`, `value`, `expires_at`, `max_uses`, `uses`) VALUES
	('SEVA10', 'percent', 10, NULL, NULL, 0),
	('FLAT20', 'flat', 2000, NULL, NULL, 0),
	('KIDSFREE', 'kids-free', 0, NULL, NULL, 0),
	('EXPIRED5', 'percent', 5, '2026-10-31T23:59:59Z', NULL, 0),
	('MAXEDOUT', 'percent', 15, NULL, 50, 50);
