<?php
require __DIR__.'/bootstrap.php';require_admin();
$pdo=db();$error='';
$categories=['Open Category','Young Bird','Old Bird','Special Category'];
$raceTypes=['Regular Race/Set','Training Toss','Special Race'];
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $action=input('action');
        if (in_array($action,['add','edit'],true)) {
            $raceId=filter_var(input('race_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            $memberId=filter_var(input('member_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            $ring=strtoupper(input('pigeon_ring'));
            $barcode=input('barcode');
            $pooling=input('pooling');
            $category=input('category');
            $raceType=input('race_type');
            if (!$raceId || !$memberId) throw new InvalidArgumentException('Select a schedule and a member.');
            if ($ring==='' || strlen($ring)>80) throw new InvalidArgumentException('Ring number is required and must be 80 characters or fewer.');
            if ($barcode==='' || strlen($barcode)>120) throw new InvalidArgumentException('Barcode is required and must be 120 characters or fewer.');
            if (!in_array($pooling,['0','1'],true)) throw new InvalidArgumentException('Invalid pooling selection.');
            if (!in_array($category,$categories,true)) throw new InvalidArgumentException('Invalid category.');
            if (!in_array($raceType,$raceTypes,true)) throw new InvalidArgumentException('Invalid race type.');
            $stmt=$pdo->prepare('SELECT release_latitude,release_longitude,name FROM races WHERE id=?');$stmt->execute([$raceId]);
            $race=$stmt->fetch();
            if(!$race) throw new InvalidArgumentException('Selected schedule does not exist.');
            $stmt=$pdo->prepare('SELECT latitude,longitude,full_name,member_no,loft_name FROM members WHERE id=?');$stmt->execute([$memberId]);
            $member=$stmt->fetch();
            if(!$member) throw new InvalidArgumentException('Selected member does not exist.');
            $distance=round(distance_m((float)$race['release_latitude'],(float)$race['release_longitude'],(float)$member['latitude'],(float)$member['longitude']),3);
            if ($action==='add') {
                $stmt=$pdo->prepare('INSERT INTO race_entries(race_id,member_id,pigeon_ring,barcode,pooling,category,race_type,distance_m) VALUES (?,?,?,?,?,?,?,?)');
                $stmt->execute([$raceId,$memberId,$ring,$barcode,(int)$pooling,$category,$raceType,$distance]);
                message('Race entry saved for '.$member['member_no'].' · '.$member['full_name'].' · '.$ring.'.');
            } else {
                $entryId=filter_var(input('entry_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
                if(!$entryId) throw new InvalidArgumentException('Invalid race entry.');
                $locked=$pdo->prepare('SELECT COUNT(*) FROM clock_events WHERE race_entry_id=?');$locked->execute([$entryId]);
                if((int)$locked->fetchColumn()>0) throw new InvalidArgumentException('This race entry already has clocking data and can no longer be edited.');
                $stmt=$pdo->prepare('UPDATE race_entries SET race_id=?,member_id=?,pigeon_ring=?,barcode=?,pooling=?,category=?,race_type=?,distance_m=? WHERE id=?');
                $stmt->execute([$raceId,$memberId,$ring,$barcode,(int)$pooling,$category,$raceType,$distance,$entryId]);
                if(!$stmt->rowCount()) throw new InvalidArgumentException('Race entry not found.');
                message('Race entry updated.');
            }
            go('race_entries.php?race_id='.$raceId);
        }
        if ($action==='delete') {
            $entryId=filter_var(input('entry_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            if(!$entryId) throw new InvalidArgumentException('Invalid race entry.');
            $locked=$pdo->prepare('SELECT COUNT(*) FROM clock_events WHERE race_entry_id=?');$locked->execute([$entryId]);
            if((int)$locked->fetchColumn()>0) throw new InvalidArgumentException('This race entry already has clocking data and cannot be deleted.');
            $stmt=$pdo->prepare('DELETE FROM race_entries WHERE id=?');$stmt->execute([$entryId]);
            if(!$stmt->rowCount()) throw new InvalidArgumentException('Race entry not found.');
            message('Race entry deleted.');go('race_entries.php');
        }
        throw new InvalidArgumentException('Unknown action.');
    } catch (PDOException $e) {
        $error='Database error. Check for duplicate ring numbers or barcodes and confirm the PostgreSQL schema is installed.';
    } catch (Throwable $e) {
        $error=$e->getMessage();
    }
}
$races=$pdo->query('SELECT id,name,status,release_location FROM races ORDER BY id DESC')->fetchAll();
$members=$pdo->query('SELECT id,member_no,full_name,loft_name,paid FROM members ORDER BY member_no,full_name')->fetchAll();
$selectedRaceId=(int)($_GET['race_id'] ?? $_POST['race_id'] ?? ($races[0]['id'] ?? 0));
$editing=null;
if (isset($_GET['edit'])) {
    $id=filter_var($_GET['edit'],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($id) {
        $stmt=$pdo->prepare('SELECT * FROM race_entries WHERE id=?');$stmt->execute([$id]);$editing=$stmt->fetch()?:null;
        if($editing) $selectedRaceId=(int)$editing['race_id'];
    }
    if(!$editing) $error='Race entry not found.';
}
$list=[];
if($selectedRaceId){
    $stmt=$pdo->prepare("SELECT e.*, r.name AS race_name, m.member_no, m.full_name, m.loft_name, (SELECT COUNT(*) FROM clock_events c WHERE c.race_entry_id=e.id) AS clocks FROM race_entries e JOIN races r ON r.id=e.race_id JOIN members m ON m.id=e.member_id WHERE e.race_id=? AND e.pigeon_ring IS NOT NULL AND e.pigeon_ring <> '' ORDER BY e.id DESC");
    $stmt->execute([$selectedRaceId]);$list=$stmt->fetchAll();
}
function race_entry_field(string $key, ?array $editing, string $default=''): string {
    return h($_POST[$key] ?? $editing[$key] ?? $default);
}
page_header('Race Entries');
?><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?>
<section class="card"><div class="row"><h2><?=$editing?'Edit Race Entry':'Register Member on a Race'?></h2><a class="btn light" href="races.php">Manage schedules →</a></div>
<?php if(!$races):?><div class="alert error">Create a race schedule first.</div><?php elseif(!$members):?><div class="alert error">Register members first.</div><?php endif;?>
<form method="post" action="race_entries.php<?=$editing?'?edit='.(int)$editing['id']:($selectedRaceId?'?race_id='.$selectedRaceId:'')?>">
<input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="<?=$editing?'edit':'add'?>"><?php if($editing):?><input type="hidden" name="entry_id" value="<?=(int)$editing['id']?>"><?php endif;?>
<div class="form-grid">
<div><label for="race_id">Schedule</label><select id="race_id" name="race_id" required><option value="">Select schedule</option><?php foreach($races as $r):?><option value="<?=(int)$r['id']?>" <?=((string)($_POST['race_id'] ?? $editing['race_id'] ?? $selectedRaceId)===(string)$r['id'])?'selected':''?>><?=h($r['name'])?></option><?php endforeach;?></select></div>
<div><label for="member_id">Member ID</label><select id="member_id" name="member_id" required><option value="">---------</option><?php foreach($members as $m):?><option value="<?=(int)$m['id']?>" <?=((string)($_POST['member_id'] ?? $editing['member_id'] ?? '')===(string)$m['id'])?'selected':''?>><?=h($m['member_no'].' · '.$m['full_name'].' · '.$m['loft_name'])?></option><?php endforeach;?></select></div>
<div><label for="pigeon_ring">Ring No</label><input id="pigeon_ring" name="pigeon_ring" maxlength="80" required value="<?=race_entry_field('pigeon_ring',$editing)?>" placeholder="PH-2026-000001"></div>
<div><label for="barcode">Barcode</label><input id="barcode" name="barcode" maxlength="120" required value="<?=race_entry_field('barcode',$editing)?>" placeholder="BE SURE YOUR CAPS LOCK IS OFF"></div>
<div><label for="pooling">Pooling</label><select id="pooling" name="pooling"><option value="0" <?=((string)($_POST['pooling'] ?? $editing['pooling'] ?? '0')==='0')?'selected':''?>>No</option><option value="1" <?=((string)($_POST['pooling'] ?? $editing['pooling'] ?? '0')==='1')?'selected':''?>>Yes</option></select></div>
<div><label for="category">Category</label><select id="category" name="category"><?php foreach($categories as $c):?><option value="<?=h($c)?>" <?=((string)($_POST['category'] ?? $editing['category'] ?? 'Open Category')===$c)?'selected':''?>><?=h($c)?></option><?php endforeach;?></select></div>
<div><label for="race_type">Race Type</label><select id="race_type" name="race_type"><?php foreach($raceTypes as $t):?><option value="<?=h($t)?>" <?=((string)($_POST['race_type'] ?? $editing['race_type'] ?? 'Regular Race/Set')===$t)?'selected':''?>><?=h($t)?></option><?php endforeach;?></select></div>
</div>
<p class="help">When saved, the system computes the entry's distance using the selected schedule's release coordinates and the member's registered loft coordinates. The stored distance becomes the snapshot for this entry.</p>
<div class="actions"><button class="btn" <?=(!$races || !$members)?'disabled':''?>><?=$editing?'Save Race Entry':'Save this Race Entry'?></button><?php if($editing):?><a class="btn light" href="race_entries.php?race_id=<?=$selectedRaceId?>">Cancel</a><?php endif;?></div>
</form></section>
<section class="card"><div class="row"><h2>Race Entries</h2><form method="get" class="row"><div><label for="race_id_filter">Schedule</label><select id="race_id_filter" name="race_id"><option value="">Select schedule</option><?php foreach($races as $r):?><option value="<?=(int)$r['id']?>" <?=((string)$selectedRaceId===(string)$r['id'])?'selected':''?>><?=h($r['name'])?></option><?php endforeach;?></select></div><div class="actions"><button class="btn light">View Entries</button></div></form></div>
<div class="table-wrap"><table><thead><tr><th>Schedule</th><th>Member ID</th><th>Ring</th><th>Barcode</th><th>Pooling / Category</th><th>Distance</th><th>Action</th></tr></thead><tbody>
<?php foreach($list as $row):?><tr><td><?=h($row['race_name'])?><div class="muted"><?=h($row['loft_name'])?></div></td><td><?=h($row['member_no'])?><div class="muted"><?=h($row['full_name'])?></div></td><td><?=h($row['pigeon_ring'])?></td><td><?=h($row['barcode'])?></td><td><?=($row['pooling']?'Yes':'No')?> · <?=h($row['category'])?><div class="muted"><?=h($row['race_type'])?></div></td><td><?=number_format((float)$row['distance_m']/1000,3)?> km</td><td><div class="point-actions"><a class="btn light" href="race_entries.php?edit=<?=(int)$row['id']?>">Edit</a><?php if((int)$row['clocks']===0):?><form method="post" onsubmit="return confirm('Delete this race entry?');"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="delete"><input type="hidden" name="entry_id" value="<?=(int)$row['id']?>"><button class="btn danger">Delete</button></form><?php else:?><span class="help">Clocked · locked</span><?php endif;?></div></td></tr><?php endforeach;?>
<?php if(!$list):?><tr><td colspan="7" class="empty">No race entries for this schedule yet.</td></tr><?php endif;?></tbody></table></div></section>
<?php page_footer(); ?>
