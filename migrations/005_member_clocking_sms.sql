-- Upgrade v1.5 -> v1.6. Back up first and import once.
USE pigeon_clock;
ALTER TABLE clock_events MODIFY created_by_admin_id BIGINT UNSIGNED NULL;
CREATE TABLE member_auth (
 member_id BIGINT UNSIGNED PRIMARY KEY,
 pin_hash VARCHAR(255) NOT NULL,
 issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_member_auth_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE sms_receipts (
 provider_message_id VARCHAR(180) PRIMARY KEY,
 sender_phone VARCHAR(20) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
