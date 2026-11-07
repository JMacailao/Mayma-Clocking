<?php
declare(strict_types=1);
// Configure credentials here or as server environment variables.
return [
    'db_host' => getenv('DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('DB_PORT') ?: '3306',
    'db_name' => getenv('DB_NAME') ?: 'pigeon_clock',
    'db_user' => getenv('DB_USER') ?: 'root',
    'db_pass' => getenv('DB_PASSWORD') ?: '',
    'timezone' => 'Asia/Manila',
];
