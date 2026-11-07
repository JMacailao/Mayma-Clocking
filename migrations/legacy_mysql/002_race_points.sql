-- Apply ONCE to an existing v1 or v1.1 database; do not run on a fresh v1.2 schema.
-- Back up your database before importing this migration.
USE pigeon_clock;
CREATE TABLE IF NOT EXISTS race_points (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 location VARCHAR(180) NOT NULL,
 description VARCHAR(500) NULL,
 sector VARCHAR(100) NOT NULL,
 latitude DECIMAL(10,7) NOT NULL,
 longitude DECIMAL(10,7) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_race_point_sector (sector),
 INDEX idx_race_point_location (location)
) ENGINE=InnoDB;
ALTER TABLE races
 ADD COLUMN race_point_id BIGINT UNSIGNED NULL AFTER name,
 ADD CONSTRAINT fk_race_point FOREIGN KEY (race_point_id) REFERENCES race_points(id) ON DELETE RESTRICT;
-- Historical races keep their original release-location/coordinate snapshots.
