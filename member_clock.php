<?php
require __DIR__.'/clocking_service.php';
require __DIR__.'/member_ui.php';
if(empty($_SESSION['member_id'])) go('member_login.php');
$memberId=(int)$_SESSION['member_id'];$pdo=db();$error='';$receipt=null;
$stmt=$pdo->prepare("SELECT DISTINCT r.id,r.name,r.release_location,r.release_at_utc FROM races r JOIN race_entries e ON e.race_id=r.id WHERE r.status='open' AND e.member_id=? AND e.pigeon_ring IS NOT NULL ORDER BY r.id DESC");
$stmt->execute([$memberId]);$races=$stmt->fetchAll();
$selectedRaceId=(int)($_POST['race_id']??$_GET['race_id']??0);
if ($_SERVER['REQUEST_METHOD']==='POST') {
    verify_csrf();
    try { $receipt=clock_submission($pdo,(int)input('race_id'),input('barcode'),$memberId,'barcode'); }
    catch (Throwable $e) { $error=$e instanceof PDOException?'Clocking service unavailable. Please retry.':$e->getMessage(); }
}
member_header('Clocking','clock');
?>
<?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?>
<?php if($receipt):?><div class="alert" role="status"><strong><?=$receipt['status']==='duplicate'?'Already clocked':'Provisional clock recorded'?></strong> · Ring <?=h($receipt['ring'])?> · Ref #<?=(int)$receipt['id']?> · <?=h(local_time($receipt['time']))?></div><?php endif;?>
<section class="card"><h2>Submit barcode</h2><p class="help">The actual clocking time is when our server receives your submission. A scan alone is not an official arrival verification.</p>
<form method="post" id="clock-form"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><p><label for="race-id">Open race schedule</label><select name="race_id" id="race-id" required><option value="">Select race</option><?php foreach($races as $race):?><option value="<?=(int)$race['id']?>" <?=(string)$selectedRaceId===(string)$race['id']?'selected':''?>><?=h($race['name'].' · '.$race['release_location'])?></option><?php endforeach;?></select></p><p><label for="barcode">Scan barcode or type the code</label><input name="barcode" id="barcode" required maxlength="120" autocapitalize="off" autocomplete="off" value="<?=h($_POST['barcode']??'')?>" placeholder="Enter code or scan"></p><div class="actions"><button class="btn" type="button" id="start-scan">Scan using camera</button><button class="btn" type="submit">Submit Clocking</button></div><p class="help" id="scan-status" aria-live="polite"></p><video id="camera-preview" style="display:none;max-width:100%;width:420px;border-radius:10px" playsinline muted></video><div class="actions"><button class="btn light" id="stop-scan" type="button" style="display:none">Stop camera</button></div></form>
<?php if(!$races):?><p class="alert error">There is no open race schedule right now.</p><?php endif;?></section>
<p><a href="member_history.php">View all clocking receipts →</a></p>
<script>
(()=>{
 const start=document.getElementById('start-scan'),stop=document.getElementById('stop-scan'),video=document.getElementById('camera-preview'),status=document.getElementById('scan-status'),code=document.getElementById('barcode');let stream=null,active=false;
 function finish(){active=false;if(stream){for(const track of stream.getTracks())track.stop();stream=null;}video.style.display='none';stop.style.display='none';}
 stop.addEventListener('click',finish);window.addEventListener('pagehide',finish);
 start.addEventListener('click',async()=>{
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status.textContent='Camera requires HTTPS or localhost in a supported browser. You can still type the barcode.';return;}
  if(!('BarcodeDetector' in window)){status.textContent='Your browser does not support built-in barcode scanning. Type the code, or use a compatible Chrome/Android browser.';return;}
  try{const detector=new BarcodeDetector({formats:['qr_code','code_128','code_39','ean_13','ean_8','data_matrix']});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});video.srcObject=stream;await video.play();active=true;video.style.display='block';stop.style.display='inline-block';status.textContent='Aim the camera at the barcode.';
  const read=async()=>{if(!active)return;try{const found=await detector.detect(video);if(found.length){code.value=found[0].rawValue;status.textContent='Barcode detected. Check the race, then press Submit Clocking.';finish();return;}}catch(e){}if(active)requestAnimationFrame(read);};requestAnimationFrame(read);
  }catch(e){finish();status.textContent='Camera could not start. Allow camera access or type the barcode.';}
 });
})();
</script><?php member_footer(); ?>
