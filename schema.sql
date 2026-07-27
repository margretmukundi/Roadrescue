-- ============================================================================
-- ROADRESCUE — MYSQL DATABASE SCHEMA & SEED DATA
-- Database Name: roadrescue
-- Compatible with MySQL 5.7+ / 8.0+ / MariaDB
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `roadrescue` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `roadrescue`;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Roles: 'owner', 'mechanic', 'fleet_owner', 'admin'
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `phone` VARCHAR(30) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('owner', 'mechanic', 'fleet_owner', 'admin') NOT NULL DEFAULT 'owner',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 2. MECHANIC PROFILES TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `mechanic_profiles`;
CREATE TABLE `mechanic_profiles` (
  `user_id` INT PRIMARY KEY,
  `bio` TEXT,
  `specializations` TEXT,
  `hourly_rate` DECIMAL(10,2) DEFAULT 0.00,
  `is_available` BOOLEAN DEFAULT TRUE,
  `is_mobile` BOOLEAN DEFAULT TRUE,
  `service_radius_km` INT DEFAULT 15,
  `id_document_url` VARCHAR(255) DEFAULT NULL,
  `cert_document_url` VARCHAR(255) DEFAULT NULL,
  `lat` DECIMAL(10, 8) DEFAULT NULL,
  `lng` DECIMAL(11, 8) DEFAULT NULL,
  `is_verified` BOOLEAN DEFAULT FALSE,
  `trust_tier` ENUM('standard', 'verified', 'elite') DEFAULT 'standard',
  `sos_eligible` BOOLEAN DEFAULT FALSE,
  `onboarding_complete` BOOLEAN DEFAULT FALSE,
  `rating_avg` DECIMAL(3,2) DEFAULT 5.00,
  `rating_count` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 3. MECHANIC PORTFOLIO PROJECTS
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `mechanic_projects`;
CREATE TABLE `mechanic_projects` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `mechanic_id` INT NOT NULL,
  `car_make` VARCHAR(50) NOT NULL,
  `car_model` VARCHAR(50) NOT NULL,
  `year` INT DEFAULT NULL,
  `photo_url` VARCHAR(255) DEFAULT NULL,
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 4. AVAILABILITY SLOTS (Calendar)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `availability_slots`;
CREATE TABLE `availability_slots` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `mechanic_id` INT NOT NULL,
  `day_of_week` TINYINT DEFAULT NULL COMMENT '0=Sun, 1=Mon, ..., 6=Sat',
  `specific_date` DATE DEFAULT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `is_recurring` BOOLEAN DEFAULT TRUE,
  `is_booked` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 5. FLEETS TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `fleets`;
CREATE TABLE `fleets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `owner_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 6. VEHICLES TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `vehicles`;
CREATE TABLE `vehicles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `fleet_id` INT DEFAULT NULL,
  `make` VARCHAR(50) NOT NULL,
  `model` VARCHAR(50) NOT NULL,
  `year` INT DEFAULT NULL,
  `plate_number` VARCHAR(30) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`fleet_id`) REFERENCES `fleets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 7. SERVICE REQUESTS TABLE
-- Types: 'standard', 'emergency', 'quotation', 'advance_booking', 'road_trip'
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `service_requests`;
CREATE TABLE `service_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `vehicle_id` INT DEFAULT NULL,
  `title` VARCHAR(150) NOT NULL,
  `description` TEXT NOT NULL,
  `urgency` ENUM('emergency', 'high', 'medium', 'low') DEFAULT 'medium',
  `request_type` VARCHAR(50) DEFAULT 'standard',
  `lat` DECIMAL(10, 8) DEFAULT NULL,
  `lng` DECIMAL(11, 8) DEFAULT NULL,
  `budget_min` DECIMAL(10,2) DEFAULT NULL,
  `budget_max` DECIMAL(10,2) DEFAULT NULL,
  `status` ENUM('open', 'assigned', 'completed', 'cancelled') DEFAULT 'open',
  `scheduled_at` DATETIME DEFAULT NULL,
  `parts_needed` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 8. BIDS / QUOTATIONS TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `bids`;
CREATE TABLE `bids` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT NOT NULL,
  `mechanic_id` INT NOT NULL,
  `proposed_price` DECIMAL(10,2) NOT NULL,
  `eta_minutes` INT NOT NULL,
  `message` TEXT,
  `status` ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`request_id`) REFERENCES `service_requests` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 9. JOBS TABLE
-- Status: 'en_route', 'in_progress', 'completed', 'cancelled'
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `jobs`;
CREATE TABLE `jobs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT NOT NULL,
  `bid_id` INT NOT NULL,
  `owner_id` INT NOT NULL,
  `mechanic_id` INT NOT NULL,
  `status` ENUM('en_route', 'in_progress', 'completed', 'cancelled') DEFAULT 'en_route',
  `completed_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`request_id`) REFERENCES `service_requests` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`bid_id`) REFERENCES `bids` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 10. REVIEWS TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `reviews`;
CREATE TABLE `reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `job_id` INT NOT NULL,
  `owner_id` INT NOT NULL,
  `mechanic_id` INT NOT NULL,
  `rating` INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  `comment` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 11. IN-APP MESSAGES TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `job_id` INT NOT NULL,
  `sender_id` INT NOT NULL,
  `receiver_id` INT NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 12. TOWING PARTNERS & TOW REQUESTS
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `towing_partners`;
CREATE TABLE `towing_partners` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `lat` DECIMAL(10, 8) DEFAULT NULL,
  `lng` DECIMAL(11, 8) DEFAULT NULL,
  `rate_per_km` DECIMAL(10,2) DEFAULT 150.00,
  `is_available` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `tow_requests`;
CREATE TABLE `tow_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT DEFAULT NULL,
  `owner_id` INT NOT NULL,
  `towing_partner_id` INT DEFAULT NULL,
  `status` ENUM('pending', 'dispatched', 'completed', 'cancelled') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`towing_partner_id`) REFERENCES `towing_partners` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 13. ROAD TRIP INSPECTIONS & CERTIFICATES
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `inspections`;
CREATE TABLE `inspections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `mechanic_id` INT NOT NULL,
  `owner_id` INT NOT NULL,
  `vehicle_id` INT DEFAULT NULL,
  `request_id` INT DEFAULT NULL,
  `travel_companion_requested` BOOLEAN DEFAULT FALSE,
  `status` ENUM('scheduled', 'in_progress', 'passed', 'failed') DEFAULT 'scheduled',
  `notes` TEXT,
  `inspected_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `certificates`;
CREATE TABLE `certificates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `inspection_id` INT NOT NULL,
  `cert_number` VARCHAR(100) NOT NULL UNIQUE,
  `valid_until` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`inspection_id`) REFERENCES `inspections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 14. SOS REQUESTS & BROADCASTS
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `sos_requests`;
CREATE TABLE `sos_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `lat` DECIMAL(10, 8) NOT NULL,
  `lng` DECIMAL(11, 8) NOT NULL,
  `status` ENUM('broadcasted', 'accepted', 'resolved', 'cancelled') DEFAULT 'broadcasted',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `sos_broadcasts`;
CREATE TABLE `sos_broadcasts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sos_id` INT NOT NULL,
  `mechanic_id` INT NOT NULL,
  `response` ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sos_id`) REFERENCES `sos_requests` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`mechanic_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 15. SAFETY EMERGENCY CONTACTS & PANIC EVENTS
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `emergency_contacts`;
CREATE TABLE `emergency_contacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `relationship` VARCHAR(50) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `panic_events`;
CREATE TABLE `panic_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `lat` DECIMAL(10, 8) DEFAULT NULL,
  `lng` DECIMAL(11, 8) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 16. NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `payload` JSON DEFAULT NULL,
  `is_read` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 17. DIGITAL SERVICE HISTORY LOGBOOK
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `service_history`;
CREATE TABLE `service_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `vehicle_id` INT NOT NULL,
  `job_id` INT DEFAULT NULL,
  `mechanic_id` INT DEFAULT NULL,
  `description` TEXT NOT NULL,
  `cost` DECIMAL(10,2) DEFAULT NULL,
  `serviced_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- INITIAL SEED DATA FOR TESTING & PREVIEW
-- ----------------------------------------------------------------------------

-- Seed Towing Partners
INSERT INTO `towing_partners` (`name`, `phone`, `lat`, `lng`, `rate_per_km`, `is_available`) VALUES
('Swift Towing Kenya', '0700111222', -0.3667, 35.2833, 150.00, TRUE),
('Heavy-Duty Rescue Towing', '0700333444', -0.3750, 35.2900, 200.00, TRUE);
