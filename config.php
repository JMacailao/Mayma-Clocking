<?php
declare(strict_types=1);
// Set these in the PHP host's environment. Never commit database credentials.
return [
    'db_host' => getenv('DB_HOST') ?: '',
    'db_port' => getenv('DB_PORT') ?: '5432',
    'db_name' => getenv('DB_NAME') ?: 'postgres',
    'db_user' => getenv('DB_USER') ?: '',
    'db_pass' => getenv('DB_PASSWORD') ?: '',
    'db_sslrootcert' => getenv('DB_SSLROOTCERT') ?: '/etc/ssl/certs/ca-certificates.crt',
    'timezone' => 'Asia/Manila',
];
