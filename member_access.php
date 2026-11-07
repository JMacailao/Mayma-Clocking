<?php
require __DIR__.'/bootstrap.php';require_admin();
$pdo=db();$error='';$issued=null;
if($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $memberId=filter_var(input('member_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if(!$memberId) throw new InvalidArgumentException('Choose a registered member.');
        $query=$pdo->prepare('SELECT member_no FROM members WHERE id=?');$query->execute([$memberId]);$member=$query->fetch();
        if(!$member) throw new InvalidArgumentException('Unknown member.');
        // 12 random hex characters; only hash is stored. Shown once, so admin must share privately.
        $password=strtoupper(bin2hex(random_bytes(6)));
        $stmt=$pdo->prepare('INSERT INTO member_auth(member_id,pin_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE pin_hash=VALUES(pin_hash)');
        $stmt->execute([$memberId,password_hash($password,PASSWORD_DEFAULT)]);
        $issued=['member_no'=>$member['member_no'],'password'=>$password];
    } catch(Throwable $e) { $error=$e instanceof PDOException?'Database error. Ensure migration 005 was imported.':$e->getMessage(); }
}
$members=$pdo->query('SELECT m.id,m.member_no,m.full_name,m.phone,(a.member_id IS NOT NULL) AS has_access FROM members m LEFT JOIN member_auth a ON a.member_id=m.id ORDER BY m.member_no')->fetchAll();
page_header('Member Clocking Access');
?><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?>
<?php if($issued):?><div class="alert"><strong>New member clocking password (shown only once)</strong><p>Member <?=h($issued['member_no'])?> · Password: <code><?=h($issued['password'])?></code></p><p>Give this password privately to the correct member. Save it now; it cannot be recovered after leaving this page.</p></div><?php endif;?>
<section class="card"><h2>Issue or Reset Member Clocking Password</h2><p class="help">Each member signs in at <a href="member_login.php">Member Clocking</a> with their Member ID and assigned password. Resetting revokes the old password.</p><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><div class="form-grid"><div><label>Select member</label><select name="member_id" required><option value="">Choose member</option><?php foreach($members as $m):?><option value="<?=(int)$m['id']?>"><?=h($m['member_no'].' · '.$m['full_name'].($m['has_access']?' (already enabled)':''))?></option><?php endforeach;?></select></div></div><div class="actions"><button class="btn">Issue / Reset Password</button></div></form></section>
<section class="card"><h2>Member Access Status</h2><div class="table-wrap"><table><thead><tr><th>Member ID</th><th>Name</th><th>Registered phone</th><th>Clocking access</th></tr></thead><tbody><?php foreach($members as $m):?><tr><td><?=h($m['member_no'])?></td><td><?=h($m['full_name'])?></td><td><?=h($m['phone']??'')?></td><td><?=$m['has_access']?'Enabled':'Not yet issued'?></td></tr><?php endforeach;?></tbody></table></div></section>
<?php page_footer(); ?>
