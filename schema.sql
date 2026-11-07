CREATE DATABASE IF NOT EXISTS pigeon_clock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pigeon_clock;
CREATE TABLE IF NOT EXISTS admins (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(100) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS members (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 member_no VARCHAR(40) NOT NULL UNIQUE,
 full_name VARCHAR(180) NOT NULL,
 first_name VARCHAR(180) NULL,
 middle_name VARCHAR(180) NULL,
 last_name VARCHAR(180) NULL,
 loft_name VARCHAR(180) NOT NULL,
 address VARCHAR(500) NULL,
 phone VARCHAR(40) NULL,
 paid TINYINT(1) NOT NULL DEFAULT 0,
 latitude DECIMAL(10,7) NOT NULL,
 longitude DECIMAL(10,7) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
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
CREATE TABLE IF NOT EXISTS races (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(180) NOT NULL,
 race_point_id BIGINT UNSIGNED NULL,
 release_location VARCHAR(180) NOT NULL,
 release_latitude DECIMAL(10,7) NOT NULL,
 release_longitude DECIMAL(10,7) NOT NULL,
 release_at_utc DATETIME(6) NOT NULL,
 status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_race_status(status),
 CONSTRAINT fk_race_point FOREIGN KEY (race_point_id) REFERENCES race_points(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS race_entries (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 race_id BIGINT UNSIGNED NOT NULL,
 member_id BIGINT UNSIGNED NOT NULL,
 pigeon_ring VARCHAR(80) NULL,
 barcode VARCHAR(120) NULL,
 pooling TINYINT(1) NOT NULL DEFAULT 0,
 category VARCHAR(100) NOT NULL DEFAULT 'Open Category',
 race_type VARCHAR(100) NOT NULL DEFAULT 'Regular Race/Set',
 distance_m DECIMAL(13,3) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_race_entries_race (race_id),
 INDEX idx_race_entries_member (member_id),
 UNIQUE KEY unique_race_ring (race_id, pigeon_ring),
 UNIQUE KEY unique_race_barcode (race_id, barcode),
 CONSTRAINT fk_entry_race FOREIGN KEY (race_id) REFERENCES races(id),
 CONSTRAINT fk_entry_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS clock_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 race_entry_id BIGINT UNSIGNED NOT NULL,
 pigeon_ring VARCHAR(80) NOT NULL,
 received_at_utc DATETIME(6) NOT NULL,
 source ENUM('admin_manual','barcode','sms') NOT NULL DEFAULT 'admin_manual',
 verification ENUM('provisional','verified','rejected') NOT NULL DEFAULT 'provisional',
 created_by_admin_id BIGINT UNSIGNED NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY unique_pigeon_clock (race_entry_id, pigeon_ring),
 CONSTRAINT fk_clock_entry FOREIGN KEY (race_entry_id) REFERENCES race_entries(id),
 CONSTRAINT fk_clock_admin FOREIGN KEY (created_by_admin_id) REFERENCES admins(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS member_auth (
 member_id BIGINT UNSIGNED PRIMARY KEY,
 pin_hash VARCHAR(255) NOT NULL,
 issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_member_auth_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sms_receipts (
 provider_message_id VARCHAR(180) PRIMARY KEY,
 sender_phone VARCHAR(20) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
