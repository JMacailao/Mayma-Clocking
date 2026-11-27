// Scan race sheet review: which boxes the reader was not sure about (shown
// yellow until someone edits them or presses "Looks right"), and which rows
// still need a look (errors or unsure boxes), for the Next / Previous buttons.

export const SHEET_FIELDS=['member_no','pigeon_ring','remarks_text','barcode'];
const OCR_SURE=70;// Tesseract confidence (0-100)
const DIGIT_SURE=.8;// digit reader confidence (0-1)

const someDigitUnsure=digits=>Array.isArray(digits)&&digits.some(d=>Number(d?.confidence)<DIGIT_SURE);
const ocrUnsure=value=>value!=null&&Number(value)>0&&Number(value)<OCR_SURE;

// Fields of one row the reader was not sure about (empty for Excel rows and typed rows).
export function unsureFields(row){
  if(!row||row.saved)return [];
  const out=[],checked=row.checked||{};
  const member=row.memberSure===false||(someDigitUnsure(row.member_no_digits)&&!row.memberSure)||(!row.member_no_digits?.length&&ocrUnsure(row.memberConfidence));
  const ring=row.ringSure===false||(someDigitUnsure(row.ring_number_digits)&&!row.ringSure)||(!row.ring_number_digits?.length&&ocrUnsure(row.ringConfidence));
  const remarks=ocrUnsure(row.remarksConfidence);
  const barcode=Boolean(String(row.barcode||'').trim())&&!row.barcodeDetected&&row.barcodeConfidence!=null&&Number(row.barcodeConfidence)<80;
  if(member&&String(row.member_no||'').trim())out.push('member_no');
  if(ring&&String(row.pigeon_ring||'').trim())out.push('pigeon_ring');
  if(remarks&&String(row.remarks_text||'').trim())out.push('remarks_text');
  if(barcode)out.push('barcode');
  return out.filter(field=>!checked[field]);
}

export const rowNeedsCheck=row=>!row.saved&&(Boolean(row.errors?.length)||unsureFields(row).length>0);

// The next (step 1) or previous (step -1) row that needs a look, after the row
// with id `fromId` (from the start when it is not given); wraps around.
export function nextRowToCheck(rows,fromId,step=1){
  const list=rows||[],n=list.length;if(!n)return null;
  const at=list.findIndex(row=>row.id===fromId);
  for(let k=1;k<=n;k++){
    const index=at<0?(step>0?k-1:n-k):((at+step*k)%n+n)%n;
    if(rowNeedsCheck(list[index]))return list[index];
  }
  return null;
}
