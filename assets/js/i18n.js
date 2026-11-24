// English / Tagalog switch. English is the default. With Tagalog chosen, text
// on screen that matches a phrase below is shown in Tagalog (menus, member
// pages, pop-ups and common buttons); anything else stays in English.
const KEY='avilonx.lang';
export const getLang=()=>{try{return localStorage.getItem(KEY)==='tl'?'tl':'en';}catch{return 'en';}};
export const setLang=lang=>{try{localStorage.setItem(KEY,lang==='tl'?'tl':'en');}catch{/* storage unavailable */}};

const TL={
  // Menus
  'My races':'Aking mga karera','My clocking history':'Kasaysayan ng aking clocking','Clocking':'Clocking','Results':'Resulta','Settings':'Settings','My pigeons':'Aking mga kalapati','Sign out':'Mag-sign out','More':'Iba pa',
  'Overview':'Buod','Race day':'Araw ng karera','Members':'Mga miyembro','Band Assignments':'Pagtatalaga ng singsing','Race points':'Mga race point','Races':'Mga karera','Race entries':'Mga entry sa karera','Entry remarks':'Mga remark sa entry','Show up':'Show up','RFID readers':'Mga RFID reader','Change history':'Kasaysayan ng pagbabago','Team accounts':'Mga account ng team',
  'MEMBER AREA':'PARA SA MIYEMBRO','MANAGEMENT':'PAMAMAHALA','STAFF':'STAFF','Supabase connected':'Nakakonekta','Language':'Wika',
  // Member dashboard
  'MEMBER DASHBOARD':'DASHBOARD NG MIYEMBRO','Clock a pigeon →':'Mag-clock ng kalapati →','Open race entries':'Mga entry sa bukas na karera','Your pigeons':'Iyong mga kalapati','Clocking receipts':'Mga resibo ng clocking','All recorded receipts':'Lahat ng naitalang resibo','Open schedules':'Mga bukas na iskedyul','Available to you':'Para sa iyo','YOUR SCHEDULE':'IYONG ISKEDYUL','Open races':'Mga bukas na karera','Race':'Karera','Release point':'Lugar ng release','Release · PH':'Release · PH','No open races are available for your registered pigeons.':'Walang bukas na karera para sa iyong mga rehistradong kalapati.',
  'Reminders':'Mga paalala','Get notified on this phone':'Makatanggap ng abiso sa teleponong ito','A notification when your pigeon is clocked, and show-up reminders.':'Abiso kapag na-clock ang iyong kalapati, at paalala sa show up.','Turn on notifications':'I-on ang mga abiso',
  // History, results, settings
  'Clocking history':'Kasaysayan ng clocking','YOUR RECEIPTS':'IYONG MGA RESIBO','Recent server-received clockings for your pigeons.':'Mga huling clocking ng iyong mga kalapati na natanggap ng server.','Ring':'Singsing','Received · PH':'Natanggap · PH','Status':'Katayuan','Clocked with':'Na-clock gamit ang',
  'CLUB RESULTS':'RESULTA NG CLUB','Race results':'Resulta ng karera','Choose a club and date to view the public race results.':'Pumili ng club at petsa para makita ang resulta.',
  'YOUR ACCOUNT':'IYONG ACCOUNT','Member profile':'Profile ng miyembro','Review your member details and update your password.':'Tingnan ang iyong detalye at palitan ang password.','Full name':'Buong pangalan','Member ID':'Member ID','Loft':'Loft','Phone':'Telepono','Address':'Address','Username':'Username','Change password':'Palitan ang password','Confirm new password':'Ulitin ang bagong password','Update password':'I-update ang password',
  // Member clocking
  'MEMBER CLOCKING':'CLOCKING NG MIYEMBRO','Record your pigeon':'Itala ang iyong kalapati','Ways to clock':'Mga paraan ng pag-clock','Loft RFID reader':'RFID reader sa loft','Android phone':'Android phone','Sticker':'Sticker','Clock with NFC tag':'Mag-clock gamit ang NFC tag','Clock with sticker scratch code':'Mag-clock gamit ang scratch code ng sticker','Open race':'Bukas na karera','Choose a race':'Pumili ng karera',"Any open race I'm entered in":'Kahit anong bukas na karerang may entry ako','Scratch code':'Scratch code','Scan barcode':'I-scan ang barcode','Submit clocking':'Ipasa ang clocking','Start phone NFC':'Simulan ang NFC ng telepono','USB NFC reader':'USB NFC reader','Clocked':'Na-clock','Camera preview will appear here.':'Lalabas dito ang camera.',
  // My pigeons
  'MY LOFT':'AKING LOFT','Your birds bonded by the club, with their races and best speed.':'Ang iyong mga ibon na na-bond ng club, kasama ang mga karera at pinakamabilis na bilis.','Bonded birds':'Mga na-bond na ibon','active':'aktibo','retired':'retirado','Photo':'Larawan','Bird':'Ibon','Colour':'Kulay','Best speed':'Pinakamabilis','entered':'naka-entry','clocked':'na-clock','Retired':'Retirado','Ring only · sticker':'Singsing lang · sticker','View photo':'Tingnan ang larawan','Close':'Isara',
  'No birds are bonded to you yet. The club bonds your birds on Band Assignments.':'Wala ka pang na-bond na ibon. Ang club ang nagbo-bond ng iyong mga ibon.','Your club has not set up bird bonding yet.':'Hindi pa naka-set up ang bird bonding ng iyong club.',
  // Result pop-up
  'Your pigeon was clocked':'Na-clock ang iyong kalapati','Clocked at':'Oras ng clock','Release':'Release','Flight time':'Tagal ng lipad','Distance':'Layo','Speed':'Bilis','Results are provisional until the club verifies them.':'Pansamantala ang resulta hanggang ma-verify ng club.','OK':'OK','Verified':'Verified','Bring the pigeon to the club before the race is closed':'Dalhin ang kalapati sa club bago isara ang karera','Race closed':'Sarado na ang karera',
  // Common
  'Save':'I-save','Cancel':'Kanselahin','Edit':'I-edit','Delete':'Burahin','Search':'Hanapin','Member':'Miyembro','Open':'Bukas','Closed':'Sarado','Draft':'Draft','Not clocked':'Hindi pa na-clock','Waiting':'Naghihintay','Disqualified':'Diskwalipikado','Rank':'Ranggo','Arrival':'Dating','Practice':'Praktis',
  'AvilonX was updated.':'Na-update ang AvilonX.','Reload':'I-reload','Later':'Mamaya','A new AvilonX app is available.':'May bagong AvilonX app.','Update':'I-update','Downloading…':'Dina-download…',
  // Start scanning (radar)
  'Start scanning':'Simulan ang pag-scan','Scanning':'Nag-i-scan','Back':'Bumalik','Arrivals':'Mga dumating','Waiting for a tag…':'Naghihintay ng tag…','Already clocked':'Na-clock na','Tap each arriving pigeon\'s tag on the reader.':'I-tap sa reader ang tag ng bawat dumarating na kalapati.','Tag read. Sending…':'Nabasa ang tag. Ipinapadala…','ACR122U reader connected':'Nakakonekta ang ACR122U reader','ACR122U helper not found. Keyboard-type USB readers and phone NFC still work.':'Hindi makita ang ACR122U helper. Gumagana pa rin ang keyboard-type na USB reader at NFC ng telepono.','Stop phone NFC':'Ihinto ang NFC ng telepono'
};

export const t=text=>getLang()==='tl'&&Object.prototype.hasOwnProperty.call(TL,text)?TL[text]:text;

// Translates text nodes and a few attributes whose whole text is a known phrase.
const ATTRS=['placeholder','aria-label','title'];
function translateNode(root){
  if(getLang()!=='tl'||!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const raw=node.nodeValue,text=raw.trim();
    if(text&&Object.prototype.hasOwnProperty.call(TL,text)&&!node.parentElement?.closest('script,style,code,[data-no-translate]')&&!(node.parentElement?.tagName==='OPTION'&&!node.parentElement.hasAttribute('value')))node.nodeValue=raw.replace(text,TL[text]);
  }
  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(element=>ATTRS.forEach(attr=>{const value=element.getAttribute(attr);if(value&&Object.prototype.hasOwnProperty.call(TL,value.trim()))element.setAttribute(attr,TL[value.trim()]);}));
}
let observer=null;
export function startTranslation(){
  document.documentElement.lang=getLang()==='tl'?'tl':'en';
  if(getLang()!=='tl'||observer)return;
  translateNode(document.body);
  observer=new MutationObserver(mutations=>mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{if(node.nodeType===1)translateNode(node);else if(node.nodeType===3&&node.parentElement)translateNode(node.parentElement);})));
  observer.observe(document.body,{childList:true,subtree:true});
}

// The English / Tagalog buttons shown in the menu.
export function languageSwitchHtml(){
  const lang=getLang();
  return `<div class="lang-switch" role="group" aria-label="Language" data-no-translate><button type="button" data-lang="en" aria-pressed="${lang==='en'}">English</button><button type="button" data-lang="tl" aria-pressed="${lang==='tl'}">Tagalog</button></div>`;
}
export function bindLanguageSwitch(root=document){
  root.querySelectorAll('[data-lang]').forEach(button=>button.onclick=()=>{if(button.dataset.lang===getLang())return;setLang(button.dataset.lang);location.reload();});
}
