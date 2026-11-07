<?php
require __DIR__ . '/bootstrap.php';
try { $count=(int)db()->query('SELECT COUNT(*) FROM admins')->fetchColumn(); }
catch (Throwable $e) { http_response_code(503); exit('Database not available. Import schema.sql and configure config.php first.'); }
if ($count>0) { http_response_code(403); exit('Setup is disabled: an admin already exists.'); }
$error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $username=input('username'); $password=(string)($_POST['password'] ?? '');
        if (strlen($username)<3 || strlen($username)>100 || strlen($password)<12) throw new InvalidArgumentException('Username needs 3+ characters and password needs at least 12 characters.');
        $stmt=db()->prepare('INSERT INTO admins(username,password_hash) VALUES (?,?)');
        $stmt->execute([$username,password_hash($password,PASSWORD_DEFAULT)]);
        message('Admin created. Please log in.'); go('login.php');
    } catch (Throwable $e) { $error=$e instanceof PDOException ? 'Could not create admin.' : $e->getMessage(); }
}
?><!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Initial Setup</title><link rel="stylesheet" href="assets/style.css"></head><body><div class="card login"><h1>First-time admin setup</h1><p class="muted">Available only while no administrator account exists.</p><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><p><label>Admin username</label><input name="username" required minlength="3"></p><p><label>Strong password (12+ characters)</label><input type="password" name="password" required minlength="12"></p><button class="btn">Create administrator</button></form></div></body></html>
