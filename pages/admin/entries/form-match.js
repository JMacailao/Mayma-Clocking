// Matching what was read on an AvilonX loading form to what the club already
// has: the member ID must be a registered member and the ring one of that
// member's bonded birds. The digit reader gives the chances of 0–9 for every
// box, so the member (or ring) that fits all the boxes best is chosen. One
// unclear digit then no longer spoils the row.
const FLOOR=1e-4;                 // the least chance a digit is given
const MISSED=Math.log(.004);      // a digit skipped, or a box with something extra
const digitsOf=value=>String(value??'').replace(/\D/g,'');
const lettersOf=value=>String(value??'').toUpperCase().replace(/[^A-Z]/g,'');

// How well the written boxes (each {chances:[10]}) fit `digits` (a log chance;
// higher is better). leading(digit) is the cost of leaving out one of the
// candidate's first digits (for example a member's leading zeros, or a ring's
// year), or null when that is not allowed.
export function digitsScore(read,digits,leading=()=>null){
  const n=read.length,m=digits.length,D=Array.from({length:n+1},()=>new Array(m+1).fill(-Infinity));
  D[0][0]=0;
  for(let j=1;j<=m;j++){const cost=leading(digits[j-1]);if(cost===null)break;D[0][j]=D[0][j-1]+cost;}
  for(let i=1;i<=n;i++){
    const chances=read[i-1].chances||[];
    D[i][0]=D[i-1][0]+MISSED;
    for(let j=1;j<=m;j++){
      const fit=D[i-1][j-1]+Math.log(Math.max(FLOOR,chances[Number(digits[j-1])]||0));
      D[i][j]=Math.max(fit,D[i-1][j]+MISSED,D[i][j-1]+MISSED);
    }
  }
  return D[n][m];
}

// Letters read (Tesseract) against a ring's letters: one step per letter that differs.
export function lettersDistance(a,b){
  const D=Array.from({length:a.length+1},(_,i)=>[i,...new Array(b.length).fill(0)]);
  for(let j=1;j<=b.length;j++)D[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)D[i][j]=Math.min(D[i-1][j]+1,D[i][j-1]+1,D[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return D[a.length][b.length];
}

// The best candidate, if it is good enough and clearly better than the next.
// candidates: [{item, score}]; boxes: how many boxes were read.
export function pickBest(candidates,boxes){
  const sorted=candidates.filter(c=>Number.isFinite(c.score)).sort((a,b)=>b.score-a.score);
  const [best,second]=sorted;
  if(!best||!boxes)return null;
  if(best.score/boxes<Math.log(.2))return null;                    // fits poorly
  if(second&&best.score-second.score<Math.log(20))return null;      // two fit about as well
  return best;
}

const memberLeading=digit=>digit==='0'?Math.log(.6):null;
const ringLeading=()=>Math.log(.25);

// Changes each form row's member ID and ring to the registered member and
// bonded ring that fit its boxes best (when one clearly does). Keeps what was
// read when nothing fits well. birds: null when the club has no bonding.
export function matchFormRows(rows,members,birds){
  for(const row of rows){
    const memberRead=row.member_no_digits||[];
    if(memberRead.length){
      const candidates=(members||[]).filter(member=>digitsOf(member.member_no)).map(member=>({item:member,score:digitsScore(memberRead,digitsOf(member.member_no),memberLeading)}));
      const best=pickBest(candidates,memberRead.length);
      row.memberRead=row.member_no;
      if(best){row.member_no=String(best.item.member_no);row.memberMatched=row.member_no!==row.memberRead;}
      row.memberSure=Boolean(best);
    }
    const ringRead=row.ring_number_digits||[];
    if(!ringRead.length||!birds)continue;
    const code=String(row.member_no).trim().toUpperCase();
    const member=(members||[]).find(item=>String(item.member_no).trim().toUpperCase()===code);
    if(!member)continue;
    const letters=lettersOf(row.ring_prefix),usesLetters=(row.prefixBoxes||[]).length>0;
    const candidates=birds.filter(bird=>bird.member_id===member.id&&bird.status==='active'&&digitsOf(bird.ring_number)).map(bird=>({item:bird,
      score:digitsScore(ringRead,digitsOf(bird.ring_number),ringLeading)+(usesLetters&&letters?lettersDistance(letters,lettersOf(bird.ring_number))*Math.log(.15):0)}));
    const best=pickBest(candidates,ringRead.length);
    row.ringRead=row.pigeon_ring;
    if(best){row.pigeon_ring=String(best.item.ring_number);row.ringMatched=row.pigeon_ring.toUpperCase()!==String(row.ringRead||'').toUpperCase();}
    row.ringSure=Boolean(best);
  }
  return rows;
}
