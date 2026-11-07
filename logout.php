<?php
require __DIR__.'/bootstrap.php';
$_SESSION=[]; session_regenerate_id(true); session_destroy(); go('login.php');
