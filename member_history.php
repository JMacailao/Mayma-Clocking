<?php
require __DIR__.'/bootstrap.php';
require __DIR__.'/member_ui.php';
if (empty($_SESSION['member_id'])) go('member_login.php');
$pdo=db();$memberId=(int)$_SESSION['member_id'];
$stmt=$pdo->prepare("SELECT r.name,e.pigeon_ring,c.received_at_utc,c.id,c.verification,c.source FROM clock_events c JOIN race_entries e ON e.id=c.race_entry_id JOIN races r ON r.id=e.race_id WHERE e.member_id=? ORDER BY c.received_at_utc DESC,c.id DESC LIMIT 200");
$stmt->execute([$memberId]);$history=$stmt->fetchAll();
member_header('Clocking History','history');
?><section class="card"><div class="row"><h2>Your recent clockings</h2><a class="btn" href="member_clock.php">Clock another pigeon</a></div><p class="help">These are server-received clocking timestamps, not independently verified pigeon arrivals.</p><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Race</th><th>Ring number</th><th>Received (PH time)</th><th>Source</th><th>Verification</th></tr></thead><tbody><?php foreach($history as $row):?><tr><td>#<?=(int)$row['id']?></td><td><?=h($row['name'])?></td><td><?=h($row['pigeon_ring'])?></td><td><?=h(local_time($row['received_at_utc']))?></td><td><?=h($row['source'])?></td><td><span class="tag"><?=h($row['verification'])?></span></td></tr><?php endforeach;if(!$history):?><tr><td colspan="6" class="empty">You have no clocking receipts yet.</td></tr><?php endif;?></tbody></table></div></section><?php member_footer(); ?>
