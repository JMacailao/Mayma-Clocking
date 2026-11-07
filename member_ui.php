<?php
/** Shared member navigation; only for authenticated member pages. */
function member_header(string $title, string $active): void {
    $memberNo = h($_SESSION['member_no'] ?? '');
    $tabs = [
        'home' => ['member_dashboard.php', 'Home'],
        'clock' => ['member_clock.php', 'Clocking'],
        'history' => ['member_history.php', 'Clocking History'],
    ];
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.h($title).' | PigeonRace Member</title><link rel="stylesheet" href="assets/style.css"></head><body class="member-body"><main class="member-page">';
    echo '<header class="member-header"><div><div class="eyebrow">PIGEON RACING CLUB</div><h1>'.h($title).'</h1><p class="muted">Signed in as Member '. $memberNo .'</p></div><a class="btn light" href="member_logout.php">Log out</a></header>';
    echo '<nav class="member-tabs" aria-label="Member navigation">';
    foreach ($tabs as $key => [$url, $label]) {
        echo '<a href="'.h($url).'" class="'.($active===$key?'active':'').'" '.($active===$key?'aria-current="page"':'').'>'.h($label).'</a>';
    }
    echo '</nav>';
}
function member_footer(): void {
    echo '<footer>Barcode submission time is recorded by the server. All member clockings remain provisional until club verification.</footer></main></body></html>';
}
