-- Prefer syncing schema with local tooling after pulling:
--   npm run db:push
-- Alternatively apply this file manually against MySQL when migrations are preferred.
-- Human-approved gold labels for offline evaluation (held out of training exports).
CREATE TABLE `listing_gold_eval` (
  `listing_id` BIGINT UNSIGNED NOT NULL,
  `brand` VARCHAR(64) NULL,
  `reference` VARCHAR(64) NULL,
  `condition` VARCHAR(32) NULL,
  `watch_type` VARCHAR(32) NULL,
  `price_cents` BIGINT UNSIGNED NULL,
  `price_min_cents` BIGINT UNSIGNED NULL,
  `price_max_cents` BIGINT UNSIGNED NULL,
  `is_bundle` TINYINT(1) NULL,
  `is_sold` TINYINT(1) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`listing_id`),
  CONSTRAINT `listing_gold_eval_listing_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings` (`id`) ON DELETE CASCADE
);
