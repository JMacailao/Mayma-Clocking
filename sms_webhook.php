<?php
/** Generic JSON inbound SMS endpoint.
 * Gateway must send raw JSON: {"from":"+639123456789","text":"CLOCK 12 ABCD1234","message_id":"provider-unique-id"}
 * Signature header X-Clock-Signature: sha256=<hex HMAC SHA-256 of RAW request body using SMS_WEBHOOK_SECRET>.
 * Webhook signature is required, no insecure fallback allowed.
 */
require __DIR__.'/clocking_service.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function sms_reply(int $status,string $message,?array $receipt=null): never {
    http_response_code($status);
    echo json_encode(['ok'=>$status<300,'message'=>$message,'receipt'=>$receipt],JSON_UNESCAPED_SLASHES);exit;
}
if($_SERVER['REQUEST_METHOD']!=='POST') sms_reply(405,'POST required');
$secret=getenv('SMS_WEBHOOK_SECRET') ?: '';
if(strlen($secret)<32) sms_reply(503,'SMS gateway not configured');
$body=file_get_contents('php://input',false,null,0,4097);
if(!is_string($body)||strlen($body)>4096) sms_reply(413,'Invalid SMS payload');
$sig=(string)($_SERVER['HTTP_X_CLOCK_SIGNATURE']??'');
$expected='sha256='.hash_hmac('sha256',$body,$secret);
if(!hash_equals($expected,$sig)) sms_reply(401,'Unauthorized SMS gateway');
try {
    $payload=json_decode($body,true,16,JSON_THROW_ON_ERROR);
    if(!is_array($payload)) sms_reply(400,'Invalid JSON');
    $phone=phone_normalize((string)($payload['from']??''));
    $text=trim((string)($payload['text']??''));
    $messageId=trim((string)($payload['message_id']??''));
    if(!$phone || strlen($messageId)<3 || strlen($messageId)>180) sms_reply(400,'Invalid sender or message ID');
    if(!preg_match('/^CLOCK\s+([1-9][0-9]{0,9})\s+(\S{1,120})$/iD',$text,$m)) sms_reply(400,'Send CLOCK <race ID> <barcode>');
    $pdo=db();
    $stmt=$pdo->prepare('SELECT id,phone FROM members WHERE phone IS NOT NULL');
    $memberId=null;
    foreach($stmt->fetchAll() as $member){if(phone_normalize((string)$member['phone'])===$phone){if($memberId!==null)sms_reply(409,'Phone registered to multiple members. Contact club administrator.');$memberId=(int)$member['id'];}}
    if(!$memberId) sms_reply(403,'Unregistered sender number');
    // Check provider message IDs before processing. Mark as handled only AFTER clock service succeeds,
    // so temporary database outages do not permanently discard a legitimate SMS.
    $seen=$pdo->prepare('SELECT provider_message_id FROM sms_receipts WHERE provider_message_id=?');
    $seen->execute([$messageId]);
    if($seen->fetch()) sms_reply(200,'Duplicate SMS message ignored');
    $receipt=clock_submission($pdo,(int)$m[1],$m[2],$memberId,'sms');
    $mark=$pdo->prepare('INSERT INTO sms_receipts(provider_message_id,sender_phone) VALUES(?,?) ON CONFLICT (provider_message_id) DO NOTHING');
    $mark->execute([$messageId,$phone]);
    $desc=$receipt['status']==='duplicate'?'Already clocked':'Clock accepted (provisional)';
    sms_reply(200,$desc.' · Ref #'.$receipt['id'].' · PH time '.local_time($receipt['time']),$receipt);
} catch(InvalidArgumentException $e) { sms_reply(200,'Clocking rejected: '.$e->getMessage()); }
catch(Throwable $e) { sms_reply(503,'Clocking service temporarily unavailable'); }
