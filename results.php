<?php
require __DIR__.'/bootstrap.php';
require_admin();
$pdo = db();
$races = $pdo->query('SELECT id, name, release_location, release_at_utc, status FROM races ORDER BY id DESC')->fetchAll();
$raceId = filter_var($_GET['race_id'] ?? ($races[0]['id'] ?? 0), FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]) ?: 0;
$category = trim((string)($_GET['category'] ?? 'all'));
$raceType = trim((string)($_GET['race_type'] ?? 'all'));
$pooling = (string)($_GET['pooling'] ?? 'all');
$status = (string)($_GET['status'] ?? 'all');
$search = trim((string)($_GET['search'] ?? ''));
$race = null;
$rows = [];
$counts = ['registered'=>0, 'clocked'=>0, 'pending'=>0, 'verified'=>0, 'provisional'=>0, 'rejected'=>0];
$categories = [];
$raceTypes = [];
$error = '';
if ($raceId) {
    $q = $pdo->prepare('SELECT * FROM races WHERE id=?');
    $q->execute([$raceId]);
    $race = $q->fetch() ?: null;
    if (!$race) $error = 'Selected race could not be found.';
}
if ($race) {
    $q = $pdo->prepare("SELECT e.id, e.pigeon_ring, e.barcode, e.pooling, e.category, e.race_type, e.distance_m,
        m.member_no, m.full_name, m.loft_name,
        c.id AS clock_id, c.received_at_utc, c.source, c.verification
        FROM race_entries e
        JOIN members m ON m.id=e.member_id
        LEFT JOIN clock_events c ON c.race_entry_id=e.id
        WHERE e.race_id=? AND e.pigeon_ring IS NOT NULL AND e.pigeon_ring <> ''
        ORDER BY e.id ASC, c.id ASC");
    $q->execute([$raceId]);
    $all = [];
    foreach ($q->fetchAll() as $r) {
        // Current schema guarantees at most one clock event per race entry/ring.
        $entryId = (int)$r['id'];
        if (isset($all[$entryId])) continue;
        $r['rank'] = null;
        $r['elapsed_seconds'] = null;
        $r['velocity'] = null;
        $r['state'] = $r['clock_id'] === null ? 'pending' : $r['verification'];
        if ($r['clock_id'] !== null) {
            $seconds = utc_micros($r['received_at_utc']) - utc_micros($race['release_at_utc']);
            if ($seconds > 0) {
                $r['elapsed_seconds'] = $seconds;
                $r['velocity'] = (float)$r['distance_m'] * 60 / $seconds;
            }
        }
        $all[$entryId] = $r;
    }
    $counts['registered'] = count($all);
    foreach ($all as $r) {
        if ($r['clock_id'] !== null) $counts['clocked']++;
        $counts[$r['state']]++;
        $categories[$r['category']] = true;
        $raceTypes[$r['race_type']] = true;
    }
    // Only positive-duration, non-rejected receipts are part of the provisional leaderboard.
    $rankable = array_values(array_filter($all, static fn($r) => $r['velocity'] !== null && $r['state'] !== 'rejected'));
    usort($rankable, static function($a, $b) {
        $compare = $b['velocity'] <=> $a['velocity'];
        if ($compare !== 0) return $compare;
        $compare = strcmp((string)$a['received_at_utc'], (string)$b['received_at_utc']);
        return $compare ?: ($a['id'] <=> $b['id']);
    });
    foreach ($rankable as $index => $r) $all[(int)$r['id']]['rank'] = $index + 1;
    // Filter the view without changing each bird's overall rank.
    foreach ($all as $r) {
        if ($category !== 'all' && $r['category'] !== $category) continue;
        if ($raceType !== 'all' && $r['race_type'] !== $raceType) continue;
        if ($pooling !== 'all' && (string)$r['pooling'] !== $pooling) continue;
        if ($status !== 'all' && $r['state'] !== $status) continue;
        if ($search !== '' && stripos(implode(' ', [$r['member_no'],$r['full_name'],$r['loft_name'],$r['pigeon_ring'],$r['barcode']]), $search) === false) continue;
        $rows[] = $r;
    }
    usort($rows, static function($a,$b) {
        $ar=$a['rank'] ?? PHP_INT_MAX;
        $br=$b['rank'] ?? PHP_INT_MAX;
        return ($ar <=> $br) ?: ($a['member_no'] <=> $b['member_no']) ?: strcmp((string)$a['pigeon_ring'], (string)$b['pigeon_ring']);
    });
}
ksort($categories);ksort($raceTypes);
function result_duration(?float $seconds): string {
    if ($seconds === null) return '—';
    $whole = (int)floor($seconds);
    return sprintf('%02d:%02d:%02d', intdiv($whole,3600), intdiv($whole % 3600,60), $whole % 60);
}
function result_status(array $r): string {
    if ($r['state'] === 'pending') return 'Not clocked';
    if ($r['elapsed_seconds'] === null) return 'Invalid time';
    return ucfirst((string)$r['state']);
}
function result_csv_cell(mixed $value): string {
    $s = (string)$value;
    // Keep user-supplied barcodes, rings, and member fields from becoming spreadsheet formulas.
    if (preg_match('/^[\s\x00-\x1F]*[=+\-@]/u', $s)) return "'".$s;
    return $s;
}
if (($_GET['export'] ?? '') === 'csv') {
    if (!$race) { http_response_code(404); exit('Race not found.'); }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="race-results-'.$raceId.'.csv"');
    header('X-Content-Type-Options: nosniff');
    echo "\xEF\xBB\xBF";
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Rank (overall)','Member ID','Member Name','Loft','Ring No','Barcode','Category','Race Type','Pooling','Distance (km)','Arrival (PH)','Flight Time (HH:MM:SS)','Velocity (m/min)','Verification','Source']);
    foreach ($rows as $r) {
        $fields = [
            $r['rank'] ?? '', $r['member_no'],$r['full_name'],$r['loft_name'],$r['pigeon_ring'],$r['barcode'],
            $r['category'],$r['race_type'], ((int)$r['pooling'] ? 'Yes':'No'),
            number_format((float)$r['distance_m']/1000,3,'.',''),
            $r['clock_id'] !== null ? local_time($r['received_at_utc']) : '',
            result_duration($r['elapsed_seconds']),
            $r['rank'] !== null ? number_format((float)$r['velocity'],3,'.','') : '',
            result_status($r), $r['source'] ?? ''
        ];
        fputcsv($out, array_map('result_csv_cell', $fields));
    }
    fclose($out);
    exit;
}
$query = $_GET;
unset($query['export']);
$baseUrl = 'results.php?'.http_build_query($query);
$exportUrl = $baseUrl.'&export=csv';
page_header('Race Results');
?>
<?php if ($error): ?><div class="alert error"><?=h($error)?></div><?php endif; ?>
<section class="card results-controls no-print">
  <div class="row"><h2>Race Results & Rankings</h2><div class="actions"><button class="btn light" type="button" onclick="window.print()">Print results</button><a class="btn" href="<?=h($exportUrl)?>" <?=$race?'':'aria-disabled="true"'?>>Export CSV</a></div></div>
  <form method="get" class="results-filters">
    <div><label for="race_id">Race schedule</label><select id="race_id" name="race_id"><?php foreach($races as $item):?><option value="<?=(int)$item['id']?>" <?=(int)$item['id']===$raceId?'selected':''?>><?=h($item['name'])?></option><?php endforeach;?></select></div>
    <div><label for="category">Category</label><select id="category" name="category"><option value="all">All categories</option><?php foreach(array_keys($categories) as $v):?><option value="<?=h($v)?>" <?=$category===$v?'selected':''?>><?=h($v)?></option><?php endforeach;?></select></div>
    <div><label for="race_type">Race type</label><select id="race_type" name="race_type"><option value="all">All types</option><?php foreach(array_keys($raceTypes) as $v):?><option value="<?=h($v)?>" <?=$raceType===$v?'selected':''?>><?=h($v)?></option><?php endforeach;?></select></div>
    <div><label for="pooling">Pooling</label><select id="pooling" name="pooling"><option value="all">All</option><option value="1" <?=$pooling==='1'?'selected':''?>>Yes</option><option value="0" <?=$pooling==='0'?'selected':''?>>No</option></select></div>
    <div><label for="status">Clocking status</label><select id="status" name="status"><option value="all">All statuses</option><?php foreach(['verified'=>'Verified','provisional'=>'Provisional','pending'=>'Not clocked','rejected'=>'Rejected'] as $key=>$label):?><option value="<?=h($key)?>" <?=$status===$key?'selected':''?>><?=h($label)?></option><?php endforeach;?></select></div>
    <div><label for="search">Search member / ring / barcode</label><input id="search" name="search" value="<?=h($search)?>" maxlength="120" placeholder="Search entries"></div>
    <div class="results-filter-actions"><button class="btn">Apply filters</button><a class="btn light" href="results.php?race_id=<?=$raceId?>">Clear</a></div>
  </form>
</section>
<?php if ($race): ?>
<section class="card print-header"><div class="row"><div><div class="eyebrow">PIGEON RACING CLOCKING SYSTEM</div><h2><?=h($race['name'])?></h2><div class="muted">Release point: <?=h($race['release_location'])?> · <?=h(display_dms((float)$race['release_latitude'],'lat'))?> · <?=h(display_dms((float)$race['release_longitude'],'lon'))?></div><div class="muted">Release time: <?=h(local_time($race['release_at_utc']))?> · Race status: <?=h(ucfirst($race['status']))?></div></div><span class="tag">PROVISIONAL RESULTS</span></div><p class="help">Ranking is by highest velocity in meters/minute, calculated from stored release-to-loft distance ÷ elapsed flight minutes. These results are provisional until club verification; barcode/manual receipt alone is not proof of physical arrival.</p></section>
<div class="results-stats">
  <section class="card"><div class="muted">Registered pigeons</div><div class="stat"><?=$counts['registered']?></div></section>
  <section class="card"><div class="muted">Clocked</div><div class="stat"><?=$counts['clocked']?></div></section>
  <section class="card"><div class="muted">Not clocked</div><div class="stat"><?=$counts['pending']?></div></section>
  <section class="card"><div class="muted">Verified / Provisional</div><div class="stat"><?=$counts['verified']?> / <?=$counts['provisional']?></div></section>
</div>
<section class="card results-table-card"><div class="row"><h2>Race leaderboard <span class="muted">(<?=count($rows)?> shown)</span></h2><span class="help">Overall ranks remain unchanged by filters. Rejected and invalid-time receipts are not ranked.</span></div>
<div class="table-wrap"><table class="results-table"><thead><tr><th>Rank</th><th>Member ID / Name</th><th>Loft</th><th>Pigeon Ring / Barcode</th><th>Category</th><th>Distance</th><th>Clocked (PH)</th><th>Flight Time</th><th>Velocity m/min</th><th>Status</th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr class="<?=$r['rank']===1?'leader-row':''?>"><td><strong><?=$r['rank'] !== null ? (int)$r['rank'] : '—'?></strong></td><td><b><?=h($r['member_no'])?></b><div><?=h($r['full_name'])?></div></td><td><?=h($r['loft_name'])?></td><td><b><?=h($r['pigeon_ring'])?></b><div class="muted"><?=h($r['barcode'])?></div></td><td><?=h($r['category'])?><div class="muted"><?=h($r['race_type'])?> · Pool: <?=$r['pooling']?'Yes':'No'?></div></td><td><?=number_format((float)$r['distance_m']/1000,3)?> km</td><td><?=$r['clock_id']!==null?h(local_time($r['received_at_utc'])):'—'?></td><td><?=h(result_duration($r['elapsed_seconds']))?></td><td class="num"><strong><?=$r['rank']!==null?number_format((float)$r['velocity'],3):'—'?></strong></td><td><span class="tag <?=h('result-'.$r['state'])?>"><?=h(result_status($r))?></span><div class="muted"><?=h($r['source']??'')?></div></td></tr><?php endforeach; ?>
<?php if (!$rows): ?><tr><td colspan="10" class="empty">No results match the selected filters. Clock registered pigeons in the Clocking page to populate race rankings.</td></tr><?php endif; ?>
</tbody></table></div></section>
<?php else: ?><section class="card"><p class="empty">No races found. Create a race schedule, register entries and clock pigeons to see results.</p><a href="races.php">Create a race →</a></section><?php endif; ?>
<?php page_footer(); ?>
