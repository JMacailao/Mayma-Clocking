<?php
require __DIR__.'/bootstrap.php';require_admin();
$pdo=db();$error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $action=input('action');
        if ($action==='create') {
            $name=input('name');$utc=utc_from_local(input('release_at'));
            $pointId=filter_var(input('race_point_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            if ($name==='') throw new InvalidArgumentException('Race name is required.');
            if (strlen($name)>180) throw new InvalidArgumentException('Race name is too long.');
            if (!$pointId) throw new InvalidArgumentException('Select a saved race point.');
            $pdo->beginTransaction();
            $select=$pdo->prepare('SELECT * FROM race_points WHERE id=? FOR UPDATE');$select->execute([$pointId]);
            $point=$select->fetch();
            if (!$point) throw new InvalidArgumentException('Selected race point does not exist.');
            $lat=(float)$point['latitude'];$lon=(float)$point['longitude'];
            $stmt=$pdo->prepare('INSERT INTO races(name,race_point_id,release_location,release_latitude,release_longitude,release_at_utc) VALUES (?,?,?,?,?,?)');
            $stmt->execute([$name,$pointId,$point['location'],$lat,$lon,$utc]);
            $pdo->commit();message('Race schedule created. Register pigeons in Race Entries next.');go('races.php');
        }
        if ($action==='status') {
            $status=input('status');$id=(int)input('race_id');
            if (!in_array($status,['draft','open','closed'],true)||$id<1) throw new InvalidArgumentException('Invalid race status.');
            $stmt=$pdo->prepare('UPDATE races SET status=? WHERE id=?');$stmt->execute([$status,$id]);message('Race status updated.');go('races.php');
        }
        throw new InvalidArgumentException('Unknown action.');
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();$error=$e instanceof PDOException?'Database error. Check the Supabase connection and PostgreSQL schema.':$e->getMessage();}
}
$points=$pdo->query('SELECT * FROM race_points ORDER BY sector,location,id')->fetchAll();
$races=$pdo->query("SELECT r.*, p.sector AS point_sector, COUNT(CASE WHEN e.pigeon_ring IS NOT NULL AND e.pigeon_ring <> '' THEN e.id END) entry_count FROM races r LEFT JOIN race_points p ON p.id=r.race_point_id LEFT JOIN race_entries e ON e.race_id=r.id GROUP BY r.id,p.sector ORDER BY r.id DESC")->fetchAll();
page_header('Race Management');
?><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?>
<section class="card"><div class="row"><h2>Create a new race</h2><a href="race_points.php">Manage Race Points →</a></div>
<?php if(!$points):?><div class="alert error">You need to <a href="race_points.php">add a race point</a> before creating a race.</div><?php endif;?>
<form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="create"><div class="form-grid">
<div><label for="race-name">Race name</label><input id="race-name" name="name" required maxlength="180" value="<?=h($_POST['name']??'')?>" placeholder="MCHPFC-S-Roxas (Dangay Port) · Nov. 1, 2026"></div>
<div><label for="race-point">Select saved race point</label><select id="race-point" name="race_point_id" required><option value="">Choose release location...</option><?php foreach($points as $p):?><option value="<?=(int)$p['id']?>" <?=((string)($_POST['race_point_id']??'')===(string)$p['id'])?'selected':''?>><?=h($p['sector'].' — '.$p['location'])?></option><?php endforeach;?></select></div>
<div class="race-point-preview" id="point-preview" aria-live="polite">Choose a race point to view its coordinates.</div>
<div><label for="release-at">Release date &amp; time (Philippines)</label><input id="release-at" name="release_at" type="datetime-local" value="<?=h($_POST['release_at']??'')?>" required></div></div>
<p class="help">The selected point's name and coordinates are copied to the race when created. Distances are calculated later when each member/pigeon is registered in Race Entries.</p>
<div class="actions"><button class="btn" <?=$points?'':'disabled'?>>Create Race Schedule</button></div></form></section>
<section class="card"><div class="row"><h2>Race list</h2><a href="race_entries.php">Register race entries →</a></div><div class="table-wrap"><table><thead><tr><th>Race</th><th>Sector / release point</th><th>Snapshot coordinates</th><th>Release time</th><th>Entries</th><th>Status / Action</th></tr></thead><tbody>
<?php foreach($races as $r):?><tr><td><a href="results.php?race_id=<?=(int)$r['id']?>"><?=h($r['name'])?></a></td><td><?=h($r['point_sector']??'Legacy race')?><div class="muted"><?=h($r['release_location'])?></div></td><td><?=h(display_dms((float)$r['release_latitude'],'lat'))?><div class="muted"><?=h(display_dms((float)$r['release_longitude'],'lon'))?></div></td><td><?=h(local_time($r['release_at_utc']))?></td><td><?=(int)$r['entry_count']?></td><td><span class="tag"><?=h($r['status'])?></span><form method="post" class="inline"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="status"><input type="hidden" name="race_id" value="<?=(int)$r['id']?>"><select name="status" aria-label="Race status"><?php foreach(['draft','open','closed'] as $s):?><option value="<?=$s?>" <?=$r['status']===$s?'selected':''?>><?=ucfirst($s)?></option><?php endforeach;?></select><button class="btn light">Save</button></form></td></tr><?php endforeach;if(!$races):?><tr><td colspan="6" class="empty">No races created.</td></tr><?php endif;?></tbody></table></div></section>
<script>
const points=<?=json_encode(array_map(static fn($p)=>['id'=>(string)$p['id'],'label'=>$p['location'],'sector'=>$p['sector'],'lat'=>display_dms((float)$p['latitude'],'lat'),'lon'=>display_dms((float)$p['longitude'],'lon')],$points),JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT)?>;
const picker=document.getElementById('race-point'),preview=document.getElementById('point-preview');
function updatePreview(){const p=points.find(x=>x.id===picker.value);preview.textContent=p?`${p.label} (${p.sector}) · ${p.lat} · ${p.lon}`:'Choose a race point to view its coordinates.';}picker.addEventListener('change',updatePreview);updatePreview();
</script>
<?php page_footer(); ?>
