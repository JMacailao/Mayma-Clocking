<?php
require __DIR__.'/bootstrap.php';
require __DIR__.'/member_ui.php';
if (empty($_SESSION['member_id'])) go('member_login.php');
$memberId=(int)$_SESSION['member_id'];
$pdo=db();
$stmt=$pdo->prepare('SELECT member_no,full_name,loft_name FROM members WHERE id=?');
$stmt->execute([$memberId]);
$member=$stmt->fetch();
if (!$member) { unset($_SESSION['member_id'],$_SESSION['member_no']); go('member_login.php'); }
$stmt=$pdo->prepare("SELECT COUNT(*) FROM race_entries e JOIN races r ON r.id=e.race_id WHERE e.member_id=? AND r.status='open' AND e.pigeon_ring IS NOT NULL");
$stmt->execute([$memberId]); $openEntries=(int)$stmt->fetchColumn();
$stmt=$pdo->prepare('SELECT COUNT(*) FROM clock_events c JOIN race_entries e ON e.id=c.race_entry_id WHERE e.member_id=?');
$stmt->execute([$memberId]); $totalClocked=(int)$stmt->fetchColumn();
$stmt=$pdo->prepare("SELECT r.id,r.name,r.release_location,r.release_at_utc,COUNT(e.id) AS pigeon_count FROM races r JOIN race_entries e ON e.race_id=r.id WHERE r.status='open' AND e.member_id=? AND e.pigeon_ring IS NOT NULL GROUP BY r.id,r.name,r.release_location,r.release_at_utc ORDER BY r.release_at_utc DESC");
$stmt->execute([$memberId]); $openRaces=$stmt->fetchAll();
member_header('Member Dashboard','home');
?>
<section class="card"><div class="row"><div><h2>Welcome, <?=h($member['full_name'])?></h2><p class="muted">Loft: <?=h($member['loft_name'])?> · Member ID: <?=h($member['member_no'])?></p></div><a class="btn" href="member_clock.php">Open Clocking →</a></div></section>
<div class="grid"><section class="card"><div class="muted">Open race entries</div><div class="stat"><?=$openEntries?></div></section><section class="card"><div class="muted">Your clocking receipts</div><div class="stat"><?=$totalClocked?></div></section><section class="card"><div class="muted">Active race schedules</div><div class="stat"><?=count($openRaces)?></div></section></div>
<section class="card"><h2>Available races</h2><div class="table-wrap"><table><thead><tr><th>Race</th><th>Release point</th><th>Release time (PH)</th><th>Registered pigeons</th><th>Clocking</th></tr></thead><tbody><?php foreach($openRaces as $race):?><tr><td><?=h($race['name'])?></td><td><?=h($race['release_location'])?></td><td><?=h(local_time($race['release_at_utc']))?></td><td><?=(int)$race['pigeon_count']?></td><td><a href="member_clock.php?race_id=<?=(int)$race['id']?>">Scan or type →</a></td></tr><?php endforeach;if (!$openRaces):?><tr><td colspan="5" class="empty">No open races with your registered pigeons yet.</td></tr><?php endif;?></tbody></table></div></section>
<?php member_footer(); ?>
