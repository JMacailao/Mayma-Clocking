

export const tagExpired=entry=>Boolean(entry.nfc_expires_at)&&new Date(entry.nfc_expires_at)<=new Date();
// The ways a registered pigeon can be clocked. The first to reach AvilonX is its receipt.
export function clockWays(entry,readerByMember){
  const ways=[];
  if(entry.nfc_tag&&!tagExpired(entry)){if(readerByMember.has(Number(entry.member_id)))ways.push('Loft reader');ways.push('Phone NFC');}
  if(entry.barcode)ways.push('Sticker');
  return ways;
}
export function distanceMeters(lat1,lon1,lat2,lon2){const rad=n=>n*Math.PI/180;const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
