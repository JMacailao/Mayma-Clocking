// Shared sample data: an open race released 2 hours ago that ends today.
module.exports=`
const now=Date.now(),iso=ms=>new Date(ms).toISOString().replace('T',' ').replace('Z','');
const today=new Date(now+8*3600e3).toISOString().slice(0,10);
F.tables.races=[{id:5,name:'Batangas Derby',status:'open',release_location:'Batangas',release_at_utc:iso(now-2*3600e3),open_date:today,end_date:today,is_practice:false,club_id:1},{id:4,name:'Practice toss',status:'closed',release_location:'Lipa',release_at_utc:iso(now-30*3600e3),open_date:today,end_date:today,is_practice:true,club_id:1}];
F.tables.members=[{id:7,member_no:'M-01',full_name:'Jeremiah Macailao',loft_name:'Sky Loft'},{id:8,member_no:'M-02',full_name:'Ana Cruz',loft_name:'Sea Loft'}];
F.tables.pigeons=[{id:1,bird_name:'Blue Lightning',color:'Blue bar',member_id:7,ring_number:'PH-1',status:'active',nfc_tag:'843519DB',photo_path:'1/7/a.jpg',bond_type:'rfid'},{id:2,bird_name:'Red Rocket',color:'Red check',member_id:8,ring_number:'PH-2',status:'active',nfc_tag:null,photo_path:'1/8/b.jpg',bond_type:'ring'},{id:3,bird_name:'Storm',color:'Grizzle',member_id:7,ring_number:'PH-3',status:'active',nfc_tag:'6C811F4A',photo_path:'1/7/c.jpg',bond_type:'rfid'}];
F.tables.race_entries=[
 {id:11,race_id:5,member_id:7,pigeon_id:1,pigeon_ring:'PH-1',distance_m:90000,remarks:['P1'],nfc_tag:'843519DB',barcode:'111',nfc_expires_at:null},
 {id:12,race_id:5,member_id:8,pigeon_id:2,pigeon_ring:'PH-2',distance_m:91000,remarks:[],nfc_tag:null,barcode:'222'},
 {id:13,race_id:5,member_id:7,pigeon_id:3,pigeon_ring:'PH-3',distance_m:90000,remarks:[],nfc_tag:'6C811F4A',barcode:'333',nfc_expires_at:null},
 {id:14,race_id:4,member_id:7,pigeon_id:1,pigeon_ring:'PH-1',distance_m:40000,remarks:[],nfc_tag:'843519DB',barcode:'444'}];
F.tables.clock_events=[
 {id:101,race_entry_id:11,pigeon_ring:'PH-1',received_at_utc:iso(now-40*60e3),verification:'verified',source:'nfc',time_source:'reader'},
 {id:102,race_entry_id:12,pigeon_ring:'PH-2',received_at_utc:iso(now-30*60e3),verification:'provisional',source:'barcode'},
 {id:103,race_entry_id:14,pigeon_ring:'PH-1',received_at_utc:iso(now-29*3600e3),verification:'verified',source:'nfc'}];
F.rpc.admin_list_rfid_devices=[{id:1,name:'Loft clock',member_id:7,member_name:'Jeremiah Macailao',is_online:false,last_seen_at:iso(now-5*3600e3),pending_taps:2},{id:2,name:'Club gate',member_id:null,is_online:true}];
`;
