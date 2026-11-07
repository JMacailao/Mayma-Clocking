-- Upgrade v1.3 to v1.4. Import only once on an existing database.
USE pigeon_clock;
ALTER TABLE race_entries
 DROP INDEX unique_entry,
 ADD COLUMN pigeon_ring VARCHAR(80) NULL AFTER member_id,
 ADD COLUMN barcode VARCHAR(120) NULL AFTER pigeon_ring,
 ADD COLUMN pooling TINYINT(1) NOT NULL DEFAULT 0 AFTER barcode,
 ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'Open Category' AFTER pooling,
 ADD COLUMN race_type VARCHAR(100) NOT NULL DEFAULT 'Regular Race/Set' AFTER category,
 ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
 ADD INDEX idx_race_entries_race (race_id),
 ADD INDEX idx_race_entries_member (member_id),
 ADD UNIQUE KEY unique_race_ring (race_id, pigeon_ring),
 ADD UNIQUE KEY unique_race_barcode (race_id, barcode);
-- Existing legacy rows remain in the table. New race schedules no longer auto-create member snapshots.
-- Distances are now stored when a pigeon is registered in Race Entries.
