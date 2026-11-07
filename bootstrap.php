<?php
declare(strict_types=1);
$config = require __DIR__ . '/config.php';
date_default_timezone_set($config['timezone']);
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ini_set('session.cookie_secure', '1');
session_start();
function db(): PDO {
    static $pdo = null;
    global $config;
    if ($pdo) return $pdo;
    if (!in_array('pgsql', PDO::getAvailableDrivers(), true)) {
        throw new RuntimeException('Enable the PHP PDO PostgreSQL extension (pdo_pgsql).');
    }
    if (!preg_match('/^[a-zA-Z0-9.-]+$/D', $config['db_host'])
        || !ctype_digit((string)$config['db_port'])
        || (int)$config['db_port'] < 1 || (int)$config['db_port'] > 65535
        || !preg_match('/^[a-zA-Z0-9_]+$/D', $config['db_name'])
        || $config['db_user'] === '' || $config['db_pass'] === '') {
        throw new RuntimeException('Configure the Supabase database connection in the server environment.');
    }
    if (!is_readable($config['db_sslrootcert']) || preg_match('/[;\\r\\n]/', $config['db_sslrootcert'])) {
        throw new RuntimeException('Configure DB_SSLROOTCERT with a readable trusted CA bundle.');
    }
    $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=verify-full;sslrootcert=%s;connect_timeout=10',
        $config['db_host'], $config['db_port'], $config['db_name'], $config['db_sslrootcert']);
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET TIME ZONE 'UTC'");
    $pdo->exec("SET search_path TO public");
    return $pdo;
}
function h(mixed $v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function csrf(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(32)); }
function verify_csrf(): void {
    if (!hash_equals(csrf(), (string)($_POST['csrf'] ?? ''))) { http_response_code(403); exit('Invalid security token. Refresh and retry.'); }
}
function go(string $to): never { header('Location: ' . $to); exit; }
function require_admin(): void { if (empty($_SESSION['admin_id'])) go('login.php'); }
function message(string $msg, string $type='success'): void { $_SESSION['flash'] = [$msg, $type]; }
function input(string $name): string { return trim((string)($_POST[$name] ?? '')); }
function latitude(string $raw): float {
    if ($raw === '' || !is_numeric($raw) || (float)$raw < -90 || (float)$raw > 90) throw new InvalidArgumentException('Latitude must be between -90 and 90.');
    return (float)$raw;
}
function longitude(string $raw): float {
    if ($raw === '' || !is_numeric($raw) || (float)$raw < -180 || (float)$raw > 180) throw new InvalidArgumentException('Longitude must be between -180 and 180.');
    return (float)$raw;
}
/** Validate DMS entries and convert to signed decimal degrees for database storage. */
function coordinate_dms(string $prefix, string $axis): float {
    $limit = $axis === 'lat' ? 90 : 180;
    $positive = $axis === 'lat' ? 'N' : 'E';
    $negative = $axis === 'lat' ? 'S' : 'W';
    $degrees = input($prefix.'_deg');
    $minutes = input($prefix.'_min');
    $seconds = input($prefix.'_sec');
    $direction = strtoupper(input($prefix.'_dir'));
    if (!preg_match('/^\d{1,3}$/D', $degrees) || !preg_match('/^\d{1,2}$/D', $minutes)
        || !preg_match('/^\d{1,2}(?:\.\d{1,6})?$/D', $seconds)) {
        throw new InvalidArgumentException(ucfirst($axis).' must contain valid degrees, minutes and seconds.');
    }
    $d = (int)$degrees;
    $m = (int)$minutes;
    $sec = (float)$seconds;
    if ($d > $limit || $m >= 60 || $sec >= 60 || ($d === $limit && ($m > 0 || $sec > 0))
        || !in_array($direction, [$positive,$negative], true)) {
        throw new InvalidArgumentException('Invalid '.($axis === 'lat' ? 'latitude' : 'longitude').' DMS coordinates.');
    }
    $value = $d + ($m / 60) + ($sec / 3600);
    return $direction === $negative ? -$value : $value;
}
/** A reusable DMS field group for latitude or longitude. */
function dms_fields(string $prefix, string $axis, ?float $stored = null): void {
    $latitude = $axis === 'lat';
    $directions = $latitude ? ['N','S'] : ['E','W'];
    $defaults = $latitude ? ['14','4','22.8'] : ['120','37','46.1994'];
    $prefill = null;
    if ($stored !== null) {
        $abs = abs($stored);
        $degrees = (int)floor($abs);
        $minsFloat = ($abs - $degrees) * 60;
        $minutes = (int)floor($minsFloat);
        $seconds = round(($minsFloat - $minutes) * 60, 4);
        if ($seconds >= 60) { $seconds=0; $minutes++; }
        if ($minutes >= 60) { $minutes=0; $degrees++; }
        $prefill = ['deg'=>(string)$degrees,'min'=>(string)$minutes,'sec'=>rtrim(rtrim(number_format($seconds,4,'.',''),'0'),'.')];
    }
    echo '<fieldset class="dms-fieldset"><legend>'.($latitude ? 'Latitude' : 'Longitude').'</legend><div class="dms-line">';
    echo '<div class="dms-directions" role="radiogroup" aria-label="'.($latitude ? 'Latitude' : 'Longitude').' direction">';
    foreach($directions as $dir) {
        $selectedDir = isset($_POST[$prefix.'_dir']) ? input($prefix.'_dir') : ($stored !== null && $stored < 0 ? $directions[1] : $directions[0]);
        $checked = $selectedDir === $dir;
        echo '<label class="dms-direction"><input type="radio" name="'.h($prefix).'_dir" value="'.$dir.'"'.($checked ? ' checked' : '').'> '.$dir.'</label>';
    }
    echo '</div><div class="dms-values">';
    foreach (['deg','min','sec'] as $i => $part) {
        $val = isset($_POST[$prefix.'_'.$part]) ? input($prefix.'_'.$part) : ($prefill[$part] ?? '');
        $max = $part === 'deg' ? ($latitude ? '90' : '180') : '59';
        $step = $part === 'sec' ? '0.000001' : '1';
        $placeholder = $defaults[$i];
        $unit = ['deg'=>'°','min'=>'′','sec'=>'″'][$part];
        echo '<label class="dms-part"><span class="sr-only">'.($latitude ? 'Latitude' : 'Longitude').' '.['deg'=>'degrees','min'=>'minutes','sec'=>'seconds'][$part].'</span>';
        echo '<input name="'.h($prefix.'_'.$part).'" type="number" min="0" max="'.$max.'" step="'.$step.'" required inputmode="decimal" placeholder="'.$placeholder.'" value="'.h($val).'">';
        echo '<span aria-hidden="true">'.$unit.'</span></label>';
    }
    echo '</div></div></fieldset>';
}
/** Format database decimal degrees for a human-readable DMS coordinate. */
function display_dms(float $coordinate, string $axis): string {
    $direction = $axis === 'lat' ? ($coordinate < 0 ? 'S' : 'N') : ($coordinate < 0 ? 'W' : 'E');
    $absolute = abs($coordinate);
    $degrees = (int)floor($absolute);
    $minuteFraction = ($absolute - $degrees)*60;
    $minutes = (int)floor($minuteFraction);
    $seconds = round(($minuteFraction - $minutes)*60, 4);
    if ($seconds >= 60) { $seconds = 0; $minutes++; }
    if ($minutes >= 60) { $minutes = 0; $degrees++; }
    return $degrees.'° '.$minutes.'′ '.rtrim(rtrim(number_format($seconds, 4, '.', ''), '0'), '.').'″ '.$direction;
}
function distance_m(float $aLat, float $aLon, float $bLat, float $bLon): float {
    $lat = deg2rad($bLat - $aLat); $lon = deg2rad($bLon - $aLon);
    $x = sin($lat/2)**2 + cos(deg2rad($aLat))*cos(deg2rad($bLat))*sin($lon/2)**2;
    return 6371008.8 * 2 * atan2(sqrt($x), sqrt(max(0,1-$x)));
}
function utc_from_local(string $datetime): string {
    global $config;
    $zone = new DateTimeZone($config['timezone']);
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $datetime, $zone);
    if (!$dt || $dt->format('Y-m-d\TH:i') !== $datetime) throw new InvalidArgumentException('Enter a valid release date/time.');
    return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
}
function local_time(string $utc): string {
    global $config;
    return (new DateTimeImmutable($utc, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($config['timezone']))->format('M d, Y h:i:s A');
}
function utc_micros(string $utc): float { return (float)(new DateTimeImmutable($utc, new DateTimeZone('UTC')))->format('U.u'); }
function page_header(string $title): void {
    $active = basename($_SERVER['SCRIPT_NAME'] ?? '');
    $nav = [
        'index.php'=>'Overview',
        'members.php'=>'Members & Lofts',
        'race_points.php'=>'Race Points',
        'races.php'=>'Races',
        'race_entries.php'=>'Race Entries',
        'member_access.php'=>'Member Access',
        'clock.php'=>'Clocking',
        'results.php'=>'Results',
    ];
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.h($title).' | PigeonRace Admin</title><link rel="stylesheet" href="assets/style.css"></head><body><div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-icon">◈</span> PigeonRace <small>CLUB ADMIN</small></div><nav>';
    foreach ($nav as $file=>$label) echo '<a class="'.($active===$file?'active':'').'" href="'.h($file).'">'.h($label).'</a>';
    echo '</nav><div class="sidebar-bottom"><span>'.h($_SESSION['username'] ?? '').'</span><a href="logout.php">Log out</a></div></aside><main class="main"><header class="top"><div><div class="eyebrow">RACE MANAGEMENT SYSTEM</div><h1>'.h($title).'</h1></div><div class="pill">Asia/Manila · UTC+8</div></header>';
    if (isset($_SESSION['flash'])) { [$msg,$type]=$_SESSION['flash'];unset($_SESSION['flash']); echo '<div class="alert '.h($type).'">'.h($msg).'</div>'; }
}
function page_footer(): void { echo '<footer>Prototype v1.5 · Manual clocking entries are provisional; official approval requires club verification.</footer></main></div></body></html>'; }
