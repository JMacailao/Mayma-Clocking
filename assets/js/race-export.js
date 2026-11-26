// Race results and entries: ranking shared by Race day and Results, and the
// one-click Excel export.
import { loadSpreadsheetParser, ringLabel, formatDateSeconds } from './shared.js';

const asUtc=value=>value?new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value))?String(value).replace(' ','T'):`${String(value).replace(' ','T')}Z`):null;
export const flightText=seconds=>{if(!(seconds>0))return '';const s=Math.round(seconds),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
export const clockedWith=clock=>!clock?'':clock.source==='barcode'?'Sticker':clock.source==='admin_manual'?'Club':clock.time_source==='reader'?'Loft RFID reader':'NFC tag';

// Disqualified = the race is closed and the clock was never verified on Show up.
// Races with Show up needed unticked never wait or disqualify.
export function showUpKey(clock,race){
  if(!clock)return 'none';
  if(clock.verification==='verified')return 'verified';
  if(clock.verification==='rejected')return 'rejected';
  if(race?.requires_show_up===false)return 'not_needed';
  return race?.status==='closed'?'disqualified':'waiting';
}

// One row per entry of the race, ranked by speed (rejected and disqualified
// clocks are not ranked).
export function raceRows(race,entries,clocks,members,birds=[]){
  const rows=entries.filter(entry=>entry.race_id===race.id).map(entry=>{
    const clock=clocks.find(item=>item.race_entry_id===entry.id)||null;
    const member=members.find(item=>item.id===entry.member_id)||null,bird=birds.find(item=>item.id===entry.pigeon_id)||null;
    const seconds=clock&&race.release_at_utc?(asUtc(clock.received_at_utc)-asUtc(race.release_at_utc))/1000:null;
    const speed=seconds>0&&entry.distance_m?entry.distance_m*60/seconds:null;
    return {entry,clock,member,bird,seconds,speed,show:showUpKey(clock,race)};
  });
  const ranked=rows.filter(row=>row.speed&&!['rejected','disqualified'].includes(row.show)).sort((a,b)=>b.speed-a.speed);
  ranked.forEach((row,index)=>{row.rank=index+1;});
  return rows.sort((a,b)=>(a.rank||1e9)-(b.rank||1e9)||String(a.entry.pigeon_ring).localeCompare(String(b.entry.pigeon_ring)));
}

const SHOW_LABEL={verified:'Verified',waiting:'Waiting',disqualified:'Disqualified',rejected:'Rejected',not_needed:'Not needed',none:''};

export async function exportRaceToExcel(race,rows){
  const XLSX=await loadSpreadsheetParser();
  const results=rows.map(row=>({
    Rank:row.rank||'',
    Ring:ringLabel(row.entry.pigeon_ring,row.entry.remarks),
    Bird:row.bird?`${row.bird.bird_name} (${row.bird.color})`:'',
    'Member no.':row.member?.member_no||'',
    Member:row.member?.full_name||'',
    Loft:row.member?.loft_name||'',
    'Distance (km)':row.entry.distance_m==null?'':Math.round(Number(row.entry.distance_m)/10)/100,
    'Arrival (PH time)':row.clock?formatDateSeconds(row.clock.received_at_utc):'Not clocked',
    'Flight time':flightText(row.seconds),
    'Speed (m/min)':row.speed?Math.round(row.speed*1000)/1000:'',
    'Clocked with':clockedWith(row.clock),
    'Show up':SHOW_LABEL[row.show]||'',
    Sticker:row.entry.barcode||'',
    'RFID tag':row.entry.nfc_tag||''
  }));
  const info=[['Race',race.name],['Release point',race.release_location||''],['Release (PH time)',race.release_at_utc?formatDateSeconds(race.release_at_utc):'Not set'],['Status',race.status],['Practice race',race.is_practice?'Yes':'No'],['Entries',rows.length],['Clocked',rows.filter(row=>row.clock).length],['Exported',formatDateSeconds(new Date())]];
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(results.length?results:[{Rank:'',Ring:'No entries'}]),'Results');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(info),'Race');
  const safe=String(race.name||'race').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-')||'race';
  XLSX.writeFile(book,`AvilonX-${safe}.xlsx`);
}
