-- Upgrade v1.2 to v1.3. Import only once on an existing database.
USE pigeon_clock;
ALTER TABLE members
 ADD COLUMN first_name VARCHAR(180) NULL AFTER full_name,
 ADD COLUMN middle_name VARCHAR(180) NULL AFTER first_name,
 ADD COLUMN last_name VARCHAR(180) NULL AFTER middle_name,
 ADD COLUMN address VARCHAR(500) NULL AFTER loft_name,
 ADD COLUMN paid TINYINT(1) NOT NULL DEFAULT 0 AFTER phone,
 ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
-- Preserve existing full names. Admins can split or correct them on the Edit Member page.
UPDATE members SET first_name=full_name, last_name='' WHERE first_name IS NULL;
