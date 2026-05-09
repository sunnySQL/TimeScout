-- Prefer syncing schema with local tooling after pulling:
--   npm run db:push
-- Alternatively apply this file manually against MySQL when migrations are preferred.
-- Adds review-queue flag for harmless multi-brand mentions (admin workflow).
ALTER TABLE `listing_label_reviews`
ADD COLUMN `multi_brand_reviewed` tinyint(1) NOT NULL DEFAULT 0;
