<?php
require __DIR__.'/bootstrap.php';
require_admin();
$pdo=db(); $error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try {
        $action=input('action');
        if ($action==='add' || $action==='edit') {
            $memberNo=input('member_no'); $first=input('first_name'); $middle=input('middle_name'); $last=input('last_name');
            $loft=input('loft_name'); $address=input('address'); $phone=input('phone'); $paid=input('paid');
            if ($memberNo==='' || $first==='' || $last==='' || $loft==='') throw new InvalidArgumentException('Member ID, first name, last name and loft name are required.');
            foreach (['Member ID'=>$memberNo,'First name'=>$first,'Middle name'=>$middle,'Last name'=>$last,'Loft name'=>$loft] as $label=>$value) {
                $max=$label==='Member ID'?40:180;
                if (strlen($value)>$max) throw new InvalidArgumentException($label.' is too long.');
            }
            if (strlen($address)>500 || strlen($phone)>40) throw new InvalidArgumentException('Address or phone number is too long.');
            if (!in_array($paid,['0','1'],true)) throw new InvalidArgumentException('Invalid payment status.');
            $lat=coordinate_dms('latitude','lat'); $lon=coordinate_dms('longitude','lon');
            $fullName=implode(' ',array_filter([$first,$middle,$last],static fn($v)=>$v!==''));
            if (strlen($fullName)>180) throw new InvalidArgumentException('Combined member name is too long (maximum 180 characters).');
            if ($action==='add') {
                $q=$pdo->prepare('INSERT INTO members(member_no,full_name,first_name,middle_name,last_name,loft_name,address,phone,paid,latitude,longitude) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
                $q->execute([$memberNo,$fullName,$first,$middle?:null,$last,$loft,$address?:null,$phone?:null,(int)$paid,$lat,$lon]);
                message('Member and loft registered.');
            } else {
                $id=filter_var(input('member_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
                if (!$id) throw new InvalidArgumentException('Invalid member record.');
                $exists=$pdo->prepare('SELECT id FROM members WHERE id=?'); $exists->execute([$id]);
                if (!$exists->fetch()) throw new InvalidArgumentException('Member not found.');
                $q=$pdo->prepare('UPDATE members SET member_no=?,full_name=?,first_name=?,middle_name=?,last_name=?,loft_name=?,address=?,phone=?,paid=?,latitude=?,longitude=? WHERE id=?');
                $q->execute([$memberNo,$fullName,$first,$middle?:null,$last,$loft,$address?:null,$phone?:null,(int)$paid,$lat,$lon,$id]);
                message('Member updated. Existing race-entry distance snapshots remain unchanged.');
            }
            go('members.php');
        }
        if ($action==='delete') {
            $id=filter_var(input('member_id'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            if (!$id) throw new InvalidArgumentException('Invalid member record.');
            $check=$pdo->prepare('SELECT COUNT(*) FROM race_entries WHERE member_id=?'); $check->execute([$id]);
            if ((int)$check->fetchColumn()>0) throw new InvalidArgumentException('This member has race entries and cannot be deleted.');
            $q=$pdo->prepare('DELETE FROM members WHERE id=?'); $q->execute([$id]);
            if (!$q->rowCount()) throw new InvalidArgumentException('Member not found.');
            message('Unused member deleted.'); go('members.php');
        }
        throw new InvalidArgumentException('Unknown action.');
    } catch (PDOException $e) {
        $error=$e->getCode()==='23000'?'Duplicate Member ID or member linked to race entries.':'Database error. Check that migration 003_members_manager.sql was imported.';
    } catch (Throwable $e) {$error=$e->getMessage();}
}
$editing=null;
if (isset($_GET['edit'])) {
    $id=filter_var($_GET['edit'],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($id) {$q=$pdo->prepare('SELECT * FROM members WHERE id=?');$q->execute([$id]);$editing=$q->fetch()?:null;}
    if (!$editing) $error='Member not found.';
}
$members=$pdo->query('SELECT m.*, (SELECT COUNT(*) FROM race_entries e WHERE e.member_id=m.id) AS race_count FROM members m ORDER BY m.id DESC')->fetchAll();
page_header('Members Manager');
function member_field(string $key, ?array $editing): string { return h($_POST[$key]??$editing[$key]??''); }
?>
<?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?>
<section class="card">
  <div class="row"><h2><?=$editing?'Edit Member & Loft':'Register Member & Loft'?></h2><?php if($editing):?><a class="btn light" href="members.php">Cancel editing</a><?php endif;?></div>
  <form method="post" action="members.php<?=$editing?'?edit='.(int)$editing['id']:''?>">
    <input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="<?=$editing?'edit':'add'?>">
    <?php if($editing):?><input type="hidden" name="member_id" value="<?=(int)$editing['id']?>"><?php endif;?>
    <div class="form-grid">
      <div><label for="member_no">Member ID *</label><input id="member_no" name="member_no" maxlength="40" required value="<?=member_field('member_no',$editing)?>" placeholder="004"></div>
      <div><label for="first_name">First Name *</label><input id="first_name" name="first_name" maxlength="180" required value="<?=member_field('first_name',$editing)?>" placeholder="J.M.B"></div>
      <div><label for="middle_name">Middle Name</label><input id="middle_name" name="middle_name" maxlength="180" value="<?=member_field('middle_name',$editing)?>"></div>
      <div><label for="last_name">Last Name *</label><input id="last_name" name="last_name" maxlength="180" required value="<?=member_field('last_name',$editing)?>"></div>
      <div><label for="loft_name">Loft Name *</label><input id="loft_name" name="loft_name" maxlength="180" required value="<?=member_field('loft_name',$editing)?>" placeholder="J.M.B LOFT"></div>
      <div><label for="address">Address</label><input id="address" name="address" maxlength="500" value="<?=member_field('address',$editing)?>" placeholder="Member or loft address"></div>
      <div><label for="phone">Registered Mobile Number (optional)</label><input id="phone" name="phone" maxlength="40" value="<?=member_field('phone',$editing)?>" placeholder="09xxxxxxxxx"></div>
      <div><label for="paid">Paid</label><select name="paid" id="paid"><option value="1" <?=($_POST['paid']??$editing['paid']??'0')=='1'?'selected':''?>>Yes</option><option value="0" <?=($_POST['paid']??$editing['paid']??'0')=='0'?'selected':''?>>No</option></select></div>
      <div class="dms-card"><h3>Registered Loft GPS Coordinates</h3><p class="help">DMS format: degrees, minutes, seconds, and N/S or E/W direction.</p><?php dms_fields('latitude','lat',$editing?(float)$editing['latitude']:null);dms_fields('longitude','lon',$editing?(float)$editing['longitude']:null);?></div>
    </div>
    <p class="help">Use verified loft coordinates. Updating coordinates does not change distances already snapshotted for existing races. A separate controlled correction workflow is needed for historical races.</p>
    <div class="actions"><button class="btn" type="submit"><?=$editing?'Save Member Changes':'Save Member & Loft'?></button></div>
  </form>
</section>
<section class="card"><div class="row"><h2>Registered Members (<?=count($members)?>)</h2><a href="races.php">Create race →</a></div>
  <div class="table-wrap"><table><thead><tr><th>Member ID</th><th>Name / Address</th><th>Loft</th><th>Loft Coordinates</th><th>Paid</th><th>Races</th><th>Actions</th></tr></thead><tbody>
    <?php foreach($members as $m):?><tr><td><strong><?=h($m['member_no'])?></strong></td><td><?=h($m['full_name'])?><div class="muted"><?=h($m['address']??'')?></div><div class="muted"><?=h($m['phone']??'')?></div></td><td><?=h($m['loft_name'])?></td><td><?=h(display_dms((float)$m['latitude'],'lat'))?><br><?=h(display_dms((float)$m['longitude'],'lon'))?></td><td><?=$m['paid']?'Yes':'No'?></td><td><?=(int)$m['race_count']?></td><td><div class="point-actions"><a class="btn light" href="members.php?edit=<?=(int)$m['id']?>">Edit</a><?php if((int)$m['race_count']===0):?><form method="post" onsubmit="return confirm('Delete this unused member?');"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="delete"><input type="hidden" name="member_id" value="<?=(int)$m['id']?>"><button type="submit" class="btn danger">Delete</button></form><?php else:?><span class="help">In race · cannot delete</span><?php endif;?></div></td></tr><?php endforeach;?>
    <?php if(!$members):?><tr><td colspan="7" class="empty">No members registered yet.</td></tr><?php endif;?>
  </tbody></table></div>
</section>
<?php page_footer(); ?>
