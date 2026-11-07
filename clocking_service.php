<?php
/** Shared clock submission service, used by member web and SMS gateways. */
require_once __DIR__.'/bootstrap.php';
function phone_normalize(string $phone): string {
    $digits=preg_replace('/[^0-9+]/','',$phone);
    if (str_starts_with($digits,'+')) $digits=substr($digits,1);
    if (preg_match('/^09\d{9}$/D',$digits)) return '63'.substr($digits,1);
    if (preg_match('/^639\d{9}$/D',$digits)) return $digits;
    return '';
}
function clock_submission(PDO $pdo, int $raceId, string $code, int $memberId, string $source): array {
    if ($raceId<1 || $memberId<1 || !in_array($source,['barcode','sms'],true)) throw new InvalidArgumentException('Invalid submission.');
    $code=trim($code);
    if ($code==='' || strlen($code)>120) throw new InvalidArgumentException('Invalid barcode length.');
    // Lock the entry and check the unique clock record atomically; do not use client/device timestamps.
    $pdo->beginTransaction();
    try {
        $stmt=$pdo->prepare("SELECT e.id,e.pigeon_ring,m.member_no,r.release_at_utc,r.status FROM race_entries e JOIN races r ON r.id=e.race_id JOIN members m ON m.id=e.member_id WHERE e.race_id=? AND e.member_id=? AND BINARY e.barcode=BINARY ? FOR UPDATE");
        $stmt->execute([$raceId,$memberId,$code]);$entry=$stmt->fetch();
        if (!$entry) throw new InvalidArgumentException('Barcode not registered to this member and race.');
        if ($entry['status']!=='open') throw new InvalidArgumentException('This race is not open for clocking.');
        $now=(string)$pdo->query('SELECT UTC_TIMESTAMP(6)')->fetchColumn();
        if (utc_micros($now)<=utc_micros($entry['release_at_utc'])) throw new InvalidArgumentException('The race has not started yet.');
        $existing=$pdo->prepare('SELECT id,received_at_utc FROM clock_events WHERE race_entry_id=? FOR UPDATE');
        $existing->execute([$entry['id']]);$found=$existing->fetch();
        if ($found) { $pdo->commit();return ['status'=>'duplicate','id'=>(int)$found['id'],'time'=>$found['received_at_utc'],'ring'=>$entry['pigeon_ring']]; }
        $insert=$pdo->prepare("INSERT INTO clock_events(race_entry_id,pigeon_ring,received_at_utc,source,verification,created_by_admin_id) VALUES (?,?,?,?,'provisional',NULL)");
        $insert->execute([$entry['id'],$entry['pigeon_ring'],$now,$source]);
        $id=(int)$pdo->lastInsertId();$pdo->commit();
        return ['status'=>'accepted','id'=>$id,'time'=>$now,'ring'=>$entry['pigeon_ring']];
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack();throw $e; }
}
