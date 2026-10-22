CREATE TABLE `recitation_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int,
	`userId` int,
	`surahNumber` int NOT NULL,
	`ayahNumber` int NOT NULL,
	`audioKey` varchar(512),
	`audioUrl` varchar(1024),
	`transcript` text,
	`score` int,
	`missingWords` text,
	`feedback` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recitation_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recitation_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`surahNumber` int NOT NULL,
	`startAyah` int NOT NULL,
	`currentAyah` int NOT NULL,
	`reciter` varchar(32) NOT NULL DEFAULT 'husary',
	`status` enum('active','completed','paused') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recitation_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
