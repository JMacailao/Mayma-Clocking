<?php
require __DIR__.'/bootstrap.php';
if (!empty($_SESSION['member_id'])) go('member_dashboard.php');
$error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    $attempts=$_SESSION['member_login_attempts']??0;
    $last=$_SESSION['member_login_last']??0;
    if ($attempts>=5 && time()-$last<900) $error='Too many login attempts. Try again in 15 minutes.';
    else {
        $stmt=db()->prepare('SELECT a.member_id,a.pin_hash,m.member_no FROM member_auth a JOIN members m ON m.id=a.member_id WHERE m.member_no=?');
        $stmt->execute([input('member_no')]);$member=$stmt->fetch();
        $pin=(string)($_POST['pin']??'');
        if ($member && password_verify($pin,$member['pin_hash'])) {
            session_regenerate_id(true);
            $_SESSION['member_id']=(int)$member['member_id'];$_SESSION['member_no']=$member['member_no'];
            unset($_SESSION['member_login_attempts'],$_SESSION['member_login_last']);go('member_dashboard.php');
        }
        $_SESSION['member_login_attempts']=$attempts+1;$_SESSION['member_login_last']=time();
        $error='Incorrect member ID or clocking password.';
    }
}
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Member Login</title><link rel="stylesheet" href="assets/style.css"></head><body><div class="card login"><h1>Member Login</h1><p class="muted">Use your club-issued member ID and clocking password. Contact your administrator if you have not received one.</p><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><p><label>Member ID</label><input name="member_no" required maxlength="40" autocomplete="username"></p><p><label>Clocking password</label><input type="password" name="pin" required autocomplete="current-password"></p><button class="btn">Sign in</button></form><p><a href="login.php">Administrator login</a></p></div></body></html>
