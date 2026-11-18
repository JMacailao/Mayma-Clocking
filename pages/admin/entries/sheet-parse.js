

// Loading form columns: No. | Loft name (member ID) | Pigeon I.D. (ring, may
// be written on two lines, e.g. "MCHPFC / 0088") | Remarks (P1/P2/P3) | Sticker.
export const compactCode=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
// Handwritten remarks such as "P1/P2/P3" or "Pl / Pz": common misreads fixed.
export function sheetRemarks(text){
  return [...new Set(String(text||'').toUpperCase().replace(/[\\|,;+]/g,'/').split(/[\/\s]+/).map(token=>token.replace(/[^A-Z0-9]/g,''))
    .map(token=>/^P[1IL!]$/.test(token)?'P1':/^P[2Z]$/.test(token)?'P2':/^P[3]$/.test(token)?'P3':/^P[4A]$/.test(token)?'P4':/^P[5S]$/.test(token)?'P5':token.replace(/^0CP$/,'OCP'))
    .filter(token=>token&&token.length<=12))];
}
// The sticker's reference number from the printed text, when the barcode itself could not be decoded.
export const stickerFromText=text=>{const tokens=String(text||'').toUpperCase().replace(/[^A-Z0-9\s-]/g,' ').split(/\s+/).filter(Boolean);return tokens.find(token=>/^N\d{6,}$/.test(token))||tokens.find(token=>/^\d{7,}-?[A-Z]?$/.test(token))||'';};
// A member by the ID written on the sheet (member number or id, also "161" for "M-161").
export function sheetMember(members,code){
  const wanted=String(code||'').trim().toUpperCase();if(!wanted)return null;
  return members.find(member=>String(member.member_no).trim().toUpperCase()===wanted)||members.find(member=>String(member.id)===wanted)
    ||members.find(member=>compactCode(member.member_no)===compactCode(wanted))
    ||(()=>{const digits=wanted.replace(/\D/g,'');if(!digits)return null;const hits=members.filter(member=>String(member.member_no).replace(/\D/g,'').replace(/^0+/,'')===digits.replace(/^0+/,''));return hits.length===1?hits[0]:null;})();
}
// The member's bonded bird for a ring written on the sheet: exact, then
// ignoring spaces and dashes, then by its number alone (e.g. "0088").
export function sheetBird(birds,memberId,ring){
  const mine=(birds||[]).filter(bird=>bird.member_id===memberId&&bird.status==='active'),wanted=compactCode(ring);if(!wanted)return null;
  const exact=mine.find(bird=>String(bird.ring_number).toUpperCase()===String(ring).trim().toUpperCase())||mine.find(bird=>compactCode(bird.ring_number)===wanted);
  if(exact)return exact;
  const digits=wanted.replace(/\D/g,'');if(digits.length<3)return null;
  const hits=mine.filter(bird=>{const own=compactCode(bird.ring_number),ownDigits=own.replace(/\D/g,'');return own.endsWith(wanted)||wanted.endsWith(own)||ownDigits===digits||ownDigits.endsWith(digits);});
  return hits.length===1?hits[0]:null;
}
