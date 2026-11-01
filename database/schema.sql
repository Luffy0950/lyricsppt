-- AI Lyrics-to-PowerPoint Generator: MySQL / MariaDB schema
-- Works with XAMPP (MariaDB), Laragon (MySQL 8) and any MySQL 5.7+ / MariaDB 10.3+.
--
-- You normally don't need to run this file: the app creates the database and
-- tables automatically on first start when DB_DRIVER=mysql. It's provided so
-- you can create them yourself in phpMyAdmin / HeidiSQL (Import → this file).

CREATE DATABASE IF NOT EXISTS `lyrics2ppt` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `lyrics2ppt`;

-- One row per presentation.
CREATE TABLE IF NOT EXISTS `projects` (
  `id`               VARCHAR(40)  NOT NULL,
  `title`            VARCHAR(160) NOT NULL,
  `artist`           VARCHAR(160) NOT NULL DEFAULT '',
  `lyrics`           MEDIUMTEXT   NOT NULL COMMENT 'Original lyrics exactly as confirmed by the user',
  `style`            VARCHAR(20)  NOT NULL COMMENT 'Chosen style preset (auto, cinematic, worship, ...)',
  `slide_size`       VARCHAR(5)   NOT NULL COMMENT '16:9 or 4:3',
  `status`           VARCHAR(20)  NOT NULL COMMENT 'queued, running, ready, partial, failed, interrupted',
  `settings_json`    LONGTEXT     NOT NULL COMMENT 'All generation settings',
  `analysis_json`    LONGTEXT     NULL     COMMENT 'Theme, mood, visual direction from the AI / offline analysis',
  `status_json`      LONGTEXT     NOT NULL COMMENT 'Stage, progress and message shown in the UI',
  `warnings_json`    LONGTEXT     NOT NULL,
  `last_export_json` LONGTEXT     NULL,
  `created_at`       DATETIME(3)  NOT NULL,
  `updated_at`       DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_projects_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per slide, in presentation order.
CREATE TABLE IF NOT EXISTS `slides` (
  `project_id`        VARCHAR(40)  NOT NULL,
  `id`                VARCHAR(40)  NOT NULL,
  `position`          INT          NOT NULL COMMENT '0-based order in the presentation',
  `kind`              VARCHAR(10)  NOT NULL COMMENT 'title, lyrics or ending',
  `section`           VARCHAR(80)  NOT NULL DEFAULT '' COMMENT 'Verse 1, Chorus, ...',
  `lyrics`            TEXT         NOT NULL COMMENT 'Lines shown on the slide, one per line',
  `mood`              VARCHAR(20)  NOT NULL,
  `visual_prompt`     TEXT         NOT NULL COMMENT 'Scene description used for the AI background',
  `stock_query`       VARCHAR(160) NOT NULL DEFAULT '',
  `background_status` VARCHAR(12)  NOT NULL COMMENT 'pending, generating, ready, failed',
  `background_source` VARCHAR(20)  NULL     COMMENT 'ai-pollinations, stock-pexels, procedural, upload',
  `background_file`   VARCHAR(120) NULL     COMMENT 'Image file name in data/assets/<project_id>/',
  `background_json`   LONGTEXT     NOT NULL COMMENT 'Full background details (credit, prompt, error)',
  `text_json`         LONGTEXT     NOT NULL COMMENT 'Font, size, colour, alignment, emphasis',
  `overlay_json`      LONGTEXT     NOT NULL,
  `accent`            CHAR(7)      NOT NULL,
  `timing_json`       LONGTEXT     NULL     COMMENT 'Reserved for optional audio sync',
  PRIMARY KEY (`project_id`, `id`),
  KEY `idx_slides_order` (`project_id`, `position`),
  CONSTRAINT `fk_slides_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Background images. The files live on disk in data/assets/<project_id>/<file_name>;
-- this table also keeps their bytes so they survive hosts that wipe the disk.
CREATE TABLE IF NOT EXISTS `assets` (
  `project_id` VARCHAR(40)  NOT NULL,
  `file_name`  VARCHAR(120) NOT NULL,
  `mime`       VARCHAR(40)  NOT NULL,
  `bytes`      INT          NOT NULL,
  `data`       LONGBLOB     NULL     COMMENT 'Image bytes, served when the file is missing',
  `created_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`project_id`, `file_name`),
  CONSTRAINT `fk_assets_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
