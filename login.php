<?php
require __DIR__.'/bootstrap.php';
if (!empty($_SESSION['admin_id'])) go('index.php');
$error='';
try { $hasAdmin=(int)db()->query('SELECT COUNT(*) FROM admins')->fetchColumn()>0; }
catch (Throwable $e) { http_response_code(503); exit('Database not available. See README.md and configure your Supabase PostgreSQL connection.'); }
if (!$hasAdmin) go('setup.php');
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    $stmt=db()->prepare('SELECT id,username,password_hash FROM admins WHERE username=?');
    $stmt->execute([input('username')]); $admin=$stmt->fetch();
    if ($admin && password_verify((string)($_POST['password'] ?? ''),$admin['password_hash'])) {
        session_regenerate_id(true); $_SESSION['admin_id']=$admin['id']; $_SESSION['username']=$admin['username']; go('index.php');
    }
    $error='Invalid username or password.';
}
?><!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login</title><link rel="stylesheet" href="assets/style.css"></head><body><div class="card login"><h1>PigeonRace Admin</h1><p class="muted">Secure administrator login</p><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif; if(isset($_SESSION['flash'])): ?><div class="alert"><?=h($_SESSION['flash'][0])?></div><?php unset($_SESSION['flash']); endif;?><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><p><label>Username</label><input name="username" autocomplete="username" required></p><p><label>Password</label><input type="password" name="password" autocomplete="current-password" required></p><button class="btn">Log in</button></form><p><a href="member_login.php">Member barcode clocking →</a></p></div></body></html>
