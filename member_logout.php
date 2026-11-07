<?php
require __DIR__.'/bootstrap.php';
unset($_SESSION['member_id'],$_SESSION['member_no']);session_regenerate_id(true);go('member_login.php');
