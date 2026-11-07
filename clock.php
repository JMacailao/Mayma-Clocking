<?php
require __DIR__.'/bootstrap.php';require_admin();
$pdo=db();$error='';
$races=$pdo->query("SELECT id,name,release_at_utc FROM races WHERE status='open' ORDER BY id DESC")->fetchAll();
$raceId=(int)($_POST['race_id']??$_GET['race_id']??($races[0]['id']??0));
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $entryId=(int)input('race_entry_id');
        if (!$raceId || !$entryId) throw new InvalidArgumentException('Select an open race and a registered race entry.');
        $stmt=$pdo->prepare("SELECT e.id,e.pigeon_ring,e.barcode,r.release_at_utc,m.full_name,m.member_no FROM race_entries e JOIN races r ON r.id=e.race_id JOIN members m ON m.id=e.member_id WHERE e.id=? AND e.race_id=? AND r.status='open'");
        $stmt->execute([$entryId,$raceId]);$entry=$stmt->fetch();
        if(!$entry) throw new InvalidArgumentException('Selected race entry is not available for this open race.');
        $now=$pdo->query('SELECT UTC_TIMESTAMP(6)')->fetchColumn();
        if(utc_micros($now)<=utc_micros($entry['release_at_utc'])) throw new InvalidArgumentException('The race has not started yet.');
        $stmt=$pdo->prepare("INSERT INTO clock_events(race_entry_id,pigeon_ring,received_at_utc,source,verification,created_by_admin_id) VALUES (?,?,?,'admin_manual','provisional',?)");
        $stmt->execute([$entry['id'],$entry['pigeon_ring'],$now,$_SESSION['admin_id']]);
        message('Provisional clock recorded for '.$entry['member_no'].' / '.$entry['pigeon_ring'].' at '.local_time($now).'.');go('clock.php?race_id='.$raceId);
    }catch(Throwable $e){$error=$e instanceof PDOException?'This race entry has already been clocked, or the database rejected the submission.':$e->getMessage();}
}
$entries=[];
if($raceId){
    $stmt=$pdo->prepare("SELECT e.id,e.pigeon_ring,e.barcode,e.distance_m,m.member_no,m.full_name,m.loft_name FROM race_entries e JOIN members m ON m.id=e.member_id WHERE e.race_id=? AND e.pigeon_ring IS NOT NULL AND e.pigeon_ring <> '' ORDER BY m.full_name,e.pigeon_ring");
    $stmt->execute([$raceId]);$entries=$stmt->fetchAll();
}
page_header('Clocking Data');
?><section class="card"><div class="row"><div><h2>Member Barcode &amp; SMS Clocking</h2><p class="muted">Members can use their camera or enter a barcode at the member clocking page. The SMS gateway endpoint must be configured with a phone number/provider before text submissions will work.</p></div><div class="actions"><a class="btn light" href="member_login.php">Member Scan Page</a><a class="btn light" href="member_access.php">Issue Member Access</a></div></div></section>
<?php<?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?><section class="card"><h2>Enter a pigeon arrival</h2><p class="muted">Admin-only manual intake for registered race entries. Timestamp is captured by the database at submission time and cannot be typed by the user.</p><?php if(!$races):?><p class="empty">No open races. Open a race in <a href="races.php">Race Management</a> first.</p><?php else:?><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><div class="form-grid"><div><label>Open race</label><select name="race_id" required onchange="location.href='clock.php?race_id='+encodeURIComponent(this.value)"><?php foreach($races as $r):?><option value="<?=(int)$r['id']?>" <?=$raceId===(int)$r['id']?'selected':''?>><?=h($r['name'])?></option><?php endforeach;?></select></div><div><label>Registered race entry</label><select name="race_entry_id" required><option value="">Select registered pigeon</option><?php foreach($entries as $e):?><option value="<?=(int)$e['id']?>"><?=h($e['member_no'].' · '.$e['full_name'].' · '.$e['pigeon_ring'].' · '.$e['barcode'].' · '.number_format((float)$e['distance_m']/1000,2).' km')?></option><?php endforeach;?></select></div></div><div class="actions"><button class="btn">Clock Pigeon Now (Provisional)</button></div></form><?php endif;?></section><section class="card"><div class="row"><h2>Ready-to-clock entries</h2><a href="race_entries.php?race_id=<?=$raceId?>">Manage race entries →</a></div><div class="table-wrap"><table><thead><tr><th>Member</th><th>Loft</th><th>Ring</th><th>Barcode</th><th>Distance</th></tr></thead><tbody><?php foreach($entries as $e):?><tr><td><?=h($e['member_no'].' · '.$e['full_name'])?></td><td><?=h($e['loft_name'])?></td><td><?=h($e['pigeon_ring'])?></td><td><?=h($e['barcode'])?></td><td><?=number_format((float)$e['distance_m']/1000,3)?> km</td></tr><?php endforeach; if(!$entries):?><tr><td colspan="5" class="empty">No registered race entries in this open race.</td></tr><?php endif;?></tbody></table></div></section><?php page_footer();?>
