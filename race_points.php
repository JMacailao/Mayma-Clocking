<?php
require __DIR__.'/bootstrap.php';require_admin();
$pdo=db();$error='';
$sectors=['North Race','South Race','East Race','West Race','Central Race','Other'];
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $action=input('action');
        if ($action==='add' || $action==='edit') {
            $location=input('location');$description=input('description');$sector=input('sector');
            if ($location==='' || $sector==='') throw new InvalidArgumentException('Location and sector are required.');
            if (strlen($location)>180 || strlen($description)>500 || strlen($sector)>100) throw new InvalidArgumentException('One of the fields is too long.');
            $lat=coordinate_dms('latitude','lat');$lon=coordinate_dms('longitude','lon');
            if ($action==='add') {
                $stmt=$pdo->prepare('INSERT INTO race_points(location,description,sector,latitude,longitude) VALUES (?,?,?,?,?)');
                $stmt->execute([$location,$description?:null,$sector,$lat,$lon]);
                message('Race point added.');
            } else {
                $id=filter_var(input('point_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
                if (!$id) throw new InvalidArgumentException('Invalid race point.');
                $stmt=$pdo->prepare('UPDATE race_points SET location=?,description=?,sector=?,latitude=?,longitude=? WHERE id=?');
                $stmt->execute([$location,$description?:null,$sector,$lat,$lon,$id]);
                if (!$stmt->rowCount()) {
                    $check=$pdo->prepare('SELECT id FROM race_points WHERE id=?');$check->execute([$id]);
                    if (!$check->fetch()) throw new InvalidArgumentException('Race point not found.');
                }
                message('Race point updated. Existing race distances and release coordinates remain unchanged.');
            }
            go('race_points.php');
        }
        if ($action==='delete') {
            $id=filter_var(input('point_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            if (!$id) throw new InvalidArgumentException('Invalid race point.');
            $check=$pdo->prepare('SELECT COUNT(*) FROM races WHERE race_point_id=?');$check->execute([$id]);
            if ((int)$check->fetchColumn()>0) throw new InvalidArgumentException('This race point is used by a race and cannot be deleted.');
            $stmt=$pdo->prepare('DELETE FROM race_points WHERE id=?');$stmt->execute([$id]);
            if (!$stmt->rowCount()) throw new InvalidArgumentException('Race point not found.');
            message('Unused race point deleted.');go('race_points.php');
        }
        throw new InvalidArgumentException('Unknown action.');
    } catch (PDOException $e) {
        $error=$e->getCode()==='23000' ? 'Cannot delete a race point referenced by a race.' : 'Database error. Confirm the v1.2 migration has been imported.';
    } catch (Throwable $e) {$error=$e->getMessage();}
}
$editing=null;
if (isset($_GET['edit'])) {
    $id=filter_var($_GET['edit'],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($id) { $q=$pdo->prepare('SELECT * FROM race_points WHERE id=?');$q->execute([$id]);$editing=$q->fetch()?:null; }
    if (!$editing) $error='Race point not found.';
}
$points=$pdo->query('SELECT p.*, (SELECT COUNT(*) FROM races r WHERE r.race_point_id=p.id) AS used_count FROM race_points p ORDER BY p.sector,p.location,p.id')->fetchAll();
page_header('Race Points Manager');
?>
<?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?>
<section class="card">
  <div class="row"><h2><?=$editing?'Edit Race Point':'Add Race Point'?></h2><?php if($editing):?><a class="btn light" href="race_points.php">Cancel editing</a><?php endif;?></div>
  <form method="post" action="race_points.php<?=$editing?'?edit='.(int)$editing['id']:''?>">
    <input type="hidden" name="csrf" value="<?=h(csrf())?>">
    <input type="hidden" name="action" value="<?=$editing?'edit':'add'?>">
    <?php if($editing):?><input type="hidden" name="point_id" value="<?=(int)$editing['id']?>"><?php endif;?>
    <div class="form-grid">
      <div><label for="location">Location name</label><input id="location" name="location" required maxlength="180" value="<?=h($_POST['location']??$editing['location']??'')?>" placeholder="Happy Valley (SOCCORO)"></div>
      <div><label for="description">Description</label><input id="description" name="description" maxlength="500" value="<?=h($_POST['description']??$editing['description']??'')?>" placeholder="Release point description"></div>
      <div><label for="sector">Sector</label><select id="sector" name="sector" required><?php $chosen=$_POST['sector']??$editing['sector']??'South Race';foreach($sectors as $sector):?><option value="<?=h($sector)?>" <?=$chosen===$sector?'selected':''?>><?=h($sector)?></option><?php endforeach;?><?php if(!in_array($chosen,$sectors,true)):?><option value="<?=h($chosen)?>" selected><?=h($chosen)?></option><?php endif;?></select></div>
      <div class="dms-card"><h3>Release-point GPS coordinates</h3><p class="help">Enter degrees, minutes and seconds (DMS). Select N/S and E/W.</p><?php dms_fields('latitude','lat',$editing?(float)$editing['latitude']:null); dms_fields('longitude','lon',$editing?(float)$editing['longitude']:null); ?></div>
    </div>
    <p class="help">Editing a race point only affects races created afterward. Existing races retain the release-coordinate and distance snapshots captured at creation.</p>
    <div class="actions"><button class="btn" type="submit"><?=$editing?'Save Race Point Changes':'Add Race Point'?></button></div>
  </form>
</section>
<section class="card"><div class="row"><h2>Saved Race Points (<?=count($points)?>)</h2><a href="races.php">Create race →</a></div>
  <div class="table-wrap"><table><thead><tr><th>Location / description</th><th>Sector</th><th>Latitude</th><th>Longitude</th><th>Races</th><th>Actions</th></tr></thead><tbody>
  <?php foreach($points as $p):?><tr><td><strong><?=h($p['location'])?></strong><div class="muted"><?=h($p['description']??'')?></div></td><td><?=h($p['sector'])?></td><td><?=h(display_dms((float)$p['latitude'],'lat'))?></td><td><?=h(display_dms((float)$p['longitude'],'lon'))?></td><td><?=(int)$p['used_count']?></td><td><div class="point-actions"><a class="btn light" href="race_points.php?edit=<?=(int)$p['id']?>">Edit</a><?php if((int)$p['used_count']===0):?><form method="post" onsubmit="return confirm('Delete this unused race point?');"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="delete"><input type="hidden" name="point_id" value="<?=(int)$p['id']?>"><button class="btn danger" type="submit">Delete</button></form><?php else:?><span class="help">In use · cannot delete</span><?php endif;?></div></td></tr><?php endforeach;?>
  <?php if(!$points):?><tr><td colspan="6" class="empty">No race points yet. Add your first release location above.</td></tr><?php endif;?></tbody></table></div>
</section>
<?php page_footer(); ?>
