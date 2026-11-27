import { supabase, escapeHTML, message, dbError, authError, fail, tableRows, USERNAME_RE, USERNAME_HELP, titleCase, loadSpreadsheetParser, normalizeImportHeader, coord2, sendEmailConfirm } from '../../assets/js/shared.js';

const fields={
  members:[['member_no','Member ID','text',true],['full_name','Full name','text',true],['first_name','First name','text'],['middle_name','Middle name','text'],['last_name','Last name','text'],['loft_name','Loft name','text',true],['address','Address','text'],['phone','Phone','text'],['email','Email (for password reset)','email'],['paid','Membership paid','select',true],['latitude','Latitude','coordinates',true],['longitude','Longitude','coordinates',true]],
  race_points:[['location','Location','text',true],['description','Description','text'],['sector','Sector','radio',true,['North','South']],['latitude','Latitude','coordinates',true],['longitude','Longitude','coordinates',true]]
};
function decimalToDms(value,key) {
  const positive=key==='latitude'?'N':'E',negative=key==='latitude'?'S':'W';
  if(value===null||value===undefined||String(value).trim()==='')return {hemisphere:positive,degrees:'',minutes:'',seconds:''};
  const decimal=Number(value);if(!Number.isFinite(decimal))return {hemisphere:positive,degrees:'',minutes:'',seconds:''};
  const totalSeconds=Math.round(Math.abs(decimal)*3600*10000)/10000;
  const degrees=Math.floor(totalSeconds/3600),remaining=totalSeconds-degrees*3600,minutes=Math.floor(remaining/60),seconds=Number((remaining-minutes*60).toFixed(4));
  return {hemisphere:decimal<0?negative:positive,degrees:String(degrees),minutes:String(minutes),seconds:String(seconds)};
}
function coordinateFieldHTML(key,label,value='',{selectDirection=false}={}) {
  const id=`field-${key}`,limit=key==='latitude'?90:180,hemispheres=key==='latitude'?['N','S']:['E','W'],parts=decimalToDms(value,key);
  return `<div class="coordinate-axis" data-coordinate-axis="${key}" data-coordinate-limit="${limit}"><span class="coordinate-name" id="${id}-label">${label}</span><input type="hidden" id="${id}" name="${key}" data-coordinate-value value="${escapeHTML(value??'')}"><div class="coordinate-values">${selectDirection?`<label class="coordinate-direction"><span class="visually-hidden">${label} direction</span><select data-coordinate-hemisphere aria-label="${label} direction">${hemispheres.map(direction=>`<option value="${direction}" ${parts.hemisphere===direction?'selected':''}>${direction}</option>`).join('')}</select></label>`:`<div class="coordinate-hemispheres" role="radiogroup" aria-labelledby="${id}-label">${hemispheres.map(direction=>`<label class="hemisphere-choice"><input type="radio" name="${key}_hemisphere" value="${direction}" ${parts.hemisphere===direction?'checked':''}><span>${direction}</span></label>`).join('')}</div>`}<label class="coordinate-part"><span class="visually-hidden">${label} degrees</span><input type="number" inputmode="numeric" autocomplete="off" data-coordinate-part="degrees" aria-label="${label} degrees" min="0" max="${limit}" step="1" value="${escapeHTML(parts.degrees)}"><span aria-hidden="true">°</span></label><label class="coordinate-part"><span class="visually-hidden">${label} minutes</span><input type="number" inputmode="numeric" autocomplete="off" data-coordinate-part="minutes" aria-label="${label} minutes" min="0" max="59" step="1" value="${escapeHTML(parts.minutes)}"><span aria-hidden="true">′</span></label><label class="coordinate-part coordinate-seconds"><span class="visually-hidden">${label} seconds</span><input type="number" inputmode="decimal" autocomplete="off" data-coordinate-part="seconds" aria-label="${label} seconds" min="0" max="59.9999" step="0.0001" value="${escapeHTML(parts.seconds)}"><span aria-hidden="true">″</span></label></div></div>`;
}
function decimalCoordinateFields(fieldsList=[]) {
  const coordinates=fieldsList.filter(([key,,type])=>type==='coordinates'&&['latitude','longitude'].includes(key));
  if(!coordinates.length)return '';
  return `<section class="coordinate-decimal-fields" aria-labelledby="coordinate-dd-heading"><div class="coordinate-decimal-heading"><h3 id="coordinate-dd-heading">DD (decimal degrees)</h3><span>Optional</span></div><p>Enter decimal coordinates here instead of degrees, minutes, and seconds.</p><div class="coordinate-decimal-grid">${coordinates.map(([key,label])=>`<label class="field"><span>${label} · DD</span><input type="number" inputmode="decimal" step="any" min="${key==='latitude'?'-90':'-180'}" max="${key==='latitude'?'90':'180'}" data-coordinate-decimal-for="${key}" placeholder="Optional"></label>`).join('')}</div></section>`;
}
function coordinateMapHTML(fieldsList=[],{title='Satellite map'}={}) {
  const addressTarget=fieldsList.some(([key])=>key==='address')?'address':'';
  const addressAction=addressTarget?'<div class="coordinate-map-tools"><button class="button secondary" type="button" data-get-address>Get Address</button><span data-address-status aria-live="polite">Click Get Address to fill coordinates and address from your current location.</span></div>':'';
  return `<section class="coordinate-map" data-coordinate-map data-address-target="${addressTarget}" aria-label="Satellite map preview">${addressAction}<div class="coordinate-map-heading"><div><h3>${title}</h3><p data-map-status aria-live="polite">Loading satellite imagery…</p><p class="map-interaction-hint">Tap or click the map to set coordinates. Drag to pan; use the plus and minus controls or scroll to zoom.</p></div><a data-map-link target="_blank" rel="noopener noreferrer" hidden>Open satellite map ↗</a></div><div class="coordinate-map-frame"><div class="coordinate-map-placeholder" data-map-placeholder><span class="map-placeholder-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></span><span>Loading satellite imagery…</span></div><div class="coordinate-map-canvas" data-map-canvas hidden></div></div></section>`;
}
const GOOGLE_MAPS_API_KEY='AIzaSyCmS46FCOenSNiQViPU03PMpkExfbH_GgU';
let googleMapsPromise=null;
function loadGoogleMaps(){
  if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
  if(!googleMapsPromise)googleMapsPromise=new Promise((resolve,reject)=>{
    const callbackName='maymaGoogleMapsReady';
    window[callbackName]=()=>{delete window[callbackName];resolve(window.google.maps);};
    window.gm_authFailure=()=>{
      document.querySelectorAll('[data-coordinate-map] [data-map-status]').forEach(status=>{status.textContent='Google Maps rejected the API key. Check API enablement, billing, and website restrictions.';});
    };
    const script=document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=${callbackName}&v=weekly`;script.async=true;script.dataset.googleMapsScript='';
    script.onerror=()=>{delete window[callbackName];reject(new Error('Google Maps could not load. Check your internet connection and API key restrictions.'));};document.head.append(script);
  }).catch(error=>{googleMapsPromise=null;throw error;});
  return googleMapsPromise;
}
function fieldHTML([key,label,type,required,options],value='') {const id=`field-${key}`;if(type==='coordinates')return coordinateFieldHTML(key,label,value);if(type==='radio')return `<div class="field radio-field" role="radiogroup" aria-labelledby="${id}-label"><span id="${id}-label">${label}</span><div class="coordinate-hemispheres radio-field-choices">${options.map((option,index)=>`<label class="hemisphere-choice"><input type="radio" name="${key}" value="${escapeHTML(option)}" ${required&&index===0?'required':''} ${value===option?'checked':''}><span>${escapeHTML(option)}</span></label>`).join('')}</div></div>`;if(type==='select')return `<label class="field"><span>${label}</span><select id="${id}" name="${key}"><option value="0">No</option><option value="1">Yes</option></select></label>`;return `<label class="field"><span>${label}</span><input id="${id}" name="${key}" type="${type}" ${type==='number'?`step="any" ${key==='latitude'?'min="-90" max="90"':key==='longitude'?'min="-180" max="180"':''}`:''} ${required?'required':''} value="${escapeHTML(value??'')}"></label>`;}
function genericForm(fieldsList,button='Save') {const hasCoordinates=fieldsList.some(([, ,type])=>type==='coordinates');return `<form class="form-grid" id="record-form">${fieldsList.map(f=>fieldHTML(f)).join('')}${hasCoordinates?decimalCoordinateFields(fieldsList):''}${hasCoordinates?coordinateMapHTML(fieldsList):''}<div class="form-actions"><button class="button primary" type="submit">${button}</button><button class="button secondary" id="cancel-edit" type="button" hidden>Cancel</button></div></form>`;}

// Race points: the form on the left, the release-location map on the right.
function racePointForm(fieldsList) {
  const field=key=>fieldsList.find(([name])=>name===key),coordinates=fieldsList.filter(([,,type])=>type==='coordinates');
  return `<form class="race-point-form" id="record-form" data-submit-label="Save race point" data-keep-cancel="true" data-coord-mode="dms"><div class="race-point-fields"><div class="panel-heading race-point-dialog-head"><h3 data-form-title id="race-point-dialog-title">Add a race point</h3><button class="race-point-dialog-close" type="button" data-close-race-point aria-label="Close">×</button></div><div class="race-point-row">${fieldHTML(field('location'))}${fieldHTML(field('sector'))}</div>${fieldHTML(field('description'))}<section class="race-point-coordinates" aria-labelledby="race-point-coordinates-heading"><div class="race-point-coordinates-head"><h4 id="race-point-coordinates-heading">Coordinates</h4><div class="segmented-toggle" role="group" aria-label="Coordinate format"><button type="button" data-coord-mode-button="dms" aria-pressed="true">Degrees, minutes, seconds</button><button type="button" data-coord-mode-button="dd" aria-pressed="false">Decimal degrees</button></div></div><div class="dms-grid" data-coord-panel="dms"><div class="dms-grid-head" aria-hidden="true"><span></span><span>Direction</span><span>Degrees</span><span>Minutes</span><span>Seconds</span></div>${coordinates.map(([key,label])=>coordinateFieldHTML(key,label,'',{selectDirection:true})).join('')}</div><div class="coordinate-decimal-grid" data-coord-panel="dd" hidden>${coordinates.map(([key,label])=>`<label class="field"><span>${label}</span><input type="number" inputmode="decimal" step="any" min="${key==='latitude'?'-90':'-180'}" max="${key==='latitude'?'90':'180'}" data-coordinate-decimal-for="${key}" placeholder="${key==='latitude'?'e.g. 14.5995':'e.g. 120.9842'}"></label>`).join('')}<p class="small">Use a minus sign for South latitude or West longitude.</p></div></section><div class="form-actions"><button class="button primary" type="submit">Save race point</button><button class="button secondary" id="cancel-edit" type="button">Cancel</button><button class="button danger-button" type="button" data-delete-point hidden>Delete race point</button></div></div><div class="race-point-map">${coordinateMapHTML(fieldsList,{title:'Pick a release location'})}</div></form>`;
}

const memberImportAliases={
  member_no:['memberid','memberno','membernumber','id'],
  full_name:['fullname','membername','name'],
  first_name:['firstname','givenname'],
  middle_name:['middlename'],
  last_name:['lastname','surname','familyname'],
  loft_name:['loftname','loft'],
  address:['address','homeaddress'],
  phone:['phone','phonenumber','contactnumber','mobile'],
  paid:['paid','membershippaid','paymentstatus','membershipstatus'],
  latitude:['latitude','lat','latitudedd','latitudedecimal','latitudedecimaldegrees'],
  latitude_hemisphere:['latitudehemisphere','latitudehemispherens','lathemisphere','latitudedirection','latdirection','latns'],
  latitude_degrees:['latitudedegrees','latdegrees','latdeg'],
  latitude_minutes:['latitudeminutes','latminutes','latmin'],
  latitude_seconds:['latitudeseconds','latseconds','latsec'],
  longitude:['longitude','lon','lng','long','longitudedd','longitudedecimal','longitudedecimaldegrees'],
  longitude_hemisphere:['longitudehemisphere','longitudehemisphereew','lonhemisphere','longitudedirection','londirection','lonew'],
  longitude_degrees:['longitudedegrees','longdegrees','longdeg','londegrees'],
  longitude_minutes:['longitudeminutes','longminutes','longmin','lonminutes'],
  longitude_seconds:['longitudeseconds','longseconds','longsec','lonseconds']
};
function parseImportedCoordinate(row,axis,limit,positive,negative,cell,columns){
  const decimalText=cell(row,axis),degreeField=`${axis}_degrees`,minuteField=`${axis}_minutes`,secondField=`${axis}_seconds`,hemisphereField=`${axis}_hemisphere`,hasDmsColumns=columns[degreeField]>=0;
  if(decimalText){
    const value=Number(decimalText);
    if(!Number.isFinite(value)||value < -limit||value > limit)return {error:`${titleCase(axis)} must be from ${-limit} to ${limit}.`};
    if(hasDmsColumns&&[degreeField,minuteField,secondField].some(field=>cell(row,field)!==''))return {error:`Use either decimal ${titleCase(axis)} or DMS columns, not both.`};
    return {value};
  }
  if(!hasDmsColumns)return {error:`${titleCase(axis)} is missing.`};
  const degreeText=cell(row,degreeField),minuteText=cell(row,minuteField),secondText=cell(row,secondField),hemisphere=(cell(row,hemisphereField)||positive).toUpperCase();
  if(!degreeText)return {error:`${titleCase(axis)} degrees are missing.`};
  const degrees=Number(degreeText),minutes=minuteText===''?0:Number(minuteText),seconds=secondText===''?0:Number(secondText);
  if(!Number.isInteger(degrees)||degrees<0||degrees>limit)return {error:`${titleCase(axis)} degrees must be a whole number from 0 to ${limit}.`};
  if(!Number.isInteger(minutes)||minutes<0||minutes>=60)return {error:`${titleCase(axis)} minutes must be a whole number from 0 to 59.`};
  if(!Number.isFinite(seconds)||seconds<0||seconds>=60)return {error:`${titleCase(axis)} seconds must be from 0 up to 59.9999.`};
  if(degrees===limit&&(minutes>0||seconds>0))return {error:`At ${limit} ${titleCase(axis)} degrees, minutes and seconds must be zero.`};
  if(hemisphere!==positive&&hemisphere!==negative)return {error:`${titleCase(axis)} hemisphere must be ${positive} or ${negative}.`};
  const magnitude=degrees+minutes/60+seconds/3600;
  return {value:Number((hemisphere===negative?-magnitude:magnitude).toFixed(7))};
}
function parseMemberWorksheet(XLSX,arrayBuffer){
  const workbook=XLSX.read(arrayBuffer,{type:'array',cellDates:false});
  if(!workbook.SheetNames?.length)throw new Error('The Excel file has no worksheet.');
  const sheet=workbook.Sheets[workbook.SheetNames[0]],matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:false});
  if(!matrix.length)throw new Error('The first worksheet is empty.');
  const headerRowIndex=matrix.slice(0,10).findIndex(row=>{
    const headers=new Set(row.map(normalizeImportHeader));
    const has=key=>memberImportAliases[key].some(alias=>headers.has(normalizeImportHeader(alias)));
    const decimalCoordinates=has('latitude')&&has('longitude'),dmsCoordinates=has('latitude_degrees')&&has('longitude_degrees');
    return has('member_no')&&has('loft_name')&&(decimalCoordinates||dmsCoordinates)&&(has('full_name')||(has('first_name')&&has('last_name')));
  });
  if(headerRowIndex<0)throw new Error('Could not find the member column headings in the first 10 rows. Include Member ID, Full name (or First name and Last name), Loft name, and either decimal Latitude/Longitude or DMS degree columns for both coordinates.');
  const header=matrix[headerRowIndex].map(normalizeImportHeader),columns={};
  for(const [field,aliases] of Object.entries(memberImportAliases))columns[field]=header.findIndex(value=>aliases.some(alias=>value===normalizeImportHeader(alias)));
  const cell=(row,field)=>{const index=columns[field];return index<0?'':String(row[index]??'').trim();};
  const dataRows=matrix.slice(headerRowIndex+1).map((row,index)=>({row,rowNumber:headerRowIndex+index+2})).filter(item=>item.row.some(value=>String(value??'').trim()!==''));
  if(dataRows.length>500)throw new Error('Import up to 500 members at a time. Split this worksheet into smaller batches.');
  const members=[],issues=[],seen=new Set();
  for(const item of dataRows){
    const row=item.row,errors=[],memberNo=cell(row,'member_no'),firstName=cell(row,'first_name'),middleName=cell(row,'middle_name'),lastName=cell(row,'last_name');
    const fullName=cell(row,'full_name')||[firstName,middleName,lastName].filter(Boolean).join(' '),loftName=cell(row,'loft_name');
    const latitudeResult=parseImportedCoordinate(row,'latitude',90,'N','S',cell,columns),longitudeResult=parseImportedCoordinate(row,'longitude',180,'E','W',cell,columns);
    if(!memberNo)errors.push('Member ID is missing.');else if(memberNo.length>40)errors.push('Member ID exceeds 40 characters.');
    if(!fullName)errors.push('Full name or first and last name is required.');else if(fullName.length>180)errors.push('Full name exceeds 180 characters.');
    if(!loftName)errors.push('Loft name is missing.');else if(loftName.length>180)errors.push('Loft name exceeds 180 characters.');
    if(latitudeResult.error)errors.push(latitudeResult.error);
    if(longitudeResult.error)errors.push(longitudeResult.error);
    for(const [value,label,max] of [[firstName,'First name',180],[middleName,'Middle name',180],[lastName,'Last name',180],[cell(row,'address'),'Address',500],[cell(row,'phone'),'Phone',40]])if(value.length>max)errors.push(`${label} exceeds ${max} characters.`);
    const paidText=cell(row,'paid').toLowerCase();let paid=0;
    if(['yes','y','true','1','paid'].includes(paidText))paid=1;else if(['','no','n','false','0','unpaid'].includes(paidText))paid=0;else errors.push('Membership paid must be Yes/No or 1/0.');
    if(memberNo){const normalized=memberNo.toLocaleLowerCase();if(seen.has(normalized))errors.push('Member ID appears more than once in this file.');else seen.add(normalized);}
    if(errors.length){issues.push({rowNumber:item.rowNumber,errors});continue;}
    members.push({__rowNumber:item.rowNumber,member_no:memberNo,full_name:fullName,first_name:firstName||null,middle_name:middleName||null,last_name:lastName||null,loft_name:loftName,address:cell(row,'address')||null,phone:cell(row,'phone')||null,paid,latitude:latitudeResult.value,longitude:longitudeResult.value});
  }
  return {members,issues,dataRows:dataRows.length};
}
function bindCoordinateEditor(form) {
  const axes=[...form.querySelectorAll('[data-coordinate-axis]')],preview=form.querySelector('[data-coordinate-map]');if(!axes.length||!preview)return {set(){},refresh(){},validate(){return true;}};
  const status=preview.querySelector('[data-map-status]'),canvas=preview.querySelector('[data-map-canvas]'),placeholder=preview.querySelector('[data-map-placeholder]'),mapLink=preview.querySelector('[data-map-link]'),addressButton=preview.querySelector('[data-get-address]'),addressStatus=preview.querySelector('[data-address-status]');let mapTimer=null,lastAddressLookup=0,mapInstance=null,mapMarker=null,lastMapPoint=null,mapRequest=0;
  const hemisphereOf=axis=>axis.querySelector('[data-coordinate-hemisphere]')?.value||axis.querySelector('input[type="radio"]:checked')?.value||'N';
  const setHemisphere=(axis,value)=>{const select=axis.querySelector('[data-coordinate-hemisphere]');if(select){select.value=value;return;}const direction=axis.querySelector(`input[type="radio"][value="${value}"]`);if(direction)direction.checked=true;};
  const decimalMode=()=>form.dataset.coordMode==='dd';
  const readAxis=axis=>{
    const key=axis.dataset.coordinateAxis,degree=axis.querySelector('[data-coordinate-part="degrees"]'),minute=axis.querySelector('[data-coordinate-part="minutes"]'),second=axis.querySelector('[data-coordinate-part="seconds"]'),hidden=axis.querySelector('[data-coordinate-value]'),hemisphere=hemisphereOf(axis),limit=Number(axis.dataset.coordinateLimit),decimalInput=form.querySelector(`[data-coordinate-decimal-for="${key}"]`);
    const fields=[degree,minute,second,decimalInput].filter(Boolean);fields.forEach(field=>{field.setCustomValidity('');field.removeAttribute('aria-invalid');});
    if(decimalInput&&decimalInput.value.trim()!==''){
      const decimal=Number(decimalInput.value);
      if(!Number.isFinite(decimal)||decimal < -limit||decimal > limit){const error=`Enter a decimal value from ${-limit} to ${limit}.`;decimalInput.setCustomValidity(error);decimalInput.setAttribute('aria-invalid','true');hidden.value='';return {valid:false,error};}
      const parts=decimalToDms(decimal,key);degree.value=parts.degrees;minute.value=parts.minutes;second.value=parts.seconds;setHemisphere(axis,parts.hemisphere);hidden.value=decimal.toFixed(7);return {valid:true,value:decimal};
    }
    if(!degree.value.trim()){hidden.value='';return {valid:false,missing:true};}
    const d=Number(degree.value),m=minute.value.trim()===''?0:Number(minute.value),s=second.value.trim()===''?0:Number(second.value);
    let error='';if(!Number.isInteger(d)||d<0||d>limit)error=`Degrees must be between 0 and ${limit}.`;else if(!Number.isInteger(m)||m<0||m>=60)error='Minutes must be a whole number from 0 to 59.';else if(!Number.isFinite(s)||s<0||s>=60)error='Seconds must be from 0 up to 59.9999.';else if(d===limit&&(m>0||s>0))error=`At ${limit} degrees, minutes and seconds must be zero.`;
    if(error){degree.setCustomValidity(error);degree.setAttribute('aria-invalid','true');hidden.value='';return {valid:false,error};}
    const magnitude=d+(m/60)+(s/3600),sign=(hemisphere==='S'||hemisphere==='W')?-1:1,decimal=Number((magnitude*sign).toFixed(7));hidden.value=decimal.toFixed(7);return {valid:true,value:decimal};
  };
  const displaySatelliteMap=async(latitude,longitude)=>{
    const request=++mapRequest;canvas.hidden=false;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Loading satellite imagery…';
    try{
      const maps=await loadGoogleMaps();if(request!==mapRequest||!canvas.isConnected)return;
      const point=[latitude,longitude],pointKey=point.map(value=>value.toFixed(7)).join(',');
      if(!mapInstance){
        mapInstance=new maps.Map(canvas,{center:{lat:latitude,lng:longitude},zoom:15,mapTypeId:'satellite',mapTypeControl:true,streetViewControl:false,fullscreenControl:true,zoomControl:true,gestureHandling:'greedy'});
        mapMarker=new maps.Marker({position:{lat:latitude,lng:longitude},map:mapInstance,title:'Selected location'});
        mapInstance.addListener('click',event=>{
          if(!event.latLng)return;
          set('latitude',event.latLng.lat());set('longitude',event.latLng.lng());refresh(true);
          if(addressStatus)addressStatus.textContent='Map point selected. Coordinates are filled; update the address if needed.';
        });
      }else{
        mapMarker.setPosition({lat:latitude,lng:longitude});
        if(lastMapPoint!==pointKey)mapInstance.setCenter({lat:latitude,lng:longitude});
      }
      lastMapPoint=pointKey;placeholder.hidden=true;
      requestAnimationFrame(()=>{if(request===mapRequest&&mapInstance)maps.event.trigger(mapInstance,'resize');});
    }catch(error){
      if(request!==mapRequest)return;
      canvas.hidden=true;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Google Maps satellite imagery could not load. Check your connection and API key setup.';status.textContent=error.message||'Google Maps is unavailable right now.';console.error('Google Maps could not load:',error);
    }
  };
  const defaultMapPoint=[12.8797,121.7740];
  const refresh=(immediate=false)=>{
    clearTimeout(mapTimer);const values=axes.map(readAxis),problem=values.find(value=>value.error);
    if(problem){
      mapLink.hidden=true;
      if(mapInstance){canvas.hidden=false;placeholder.hidden=true;}
      else{canvas.hidden=false;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Loading the satellite map. Correct the coordinate or tap the map to choose a new location.';mapTimer=setTimeout(()=>displaySatelliteMap(...defaultMapPoint),0);}
      status.textContent=problem.error;return;
    }
    if(values.some(value=>!value.valid)){
      mapLink.hidden=true;status.textContent='Tap the satellite map to choose a location, or enter both coordinates above.';
      if(!mapInstance){canvas.hidden=false;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Loading the satellite map. Tap anywhere on it to choose coordinates.';mapTimer=setTimeout(()=>displaySatelliteMap(...defaultMapPoint),0);}
      else{canvas.hidden=false;placeholder.hidden=true;requestAnimationFrame(()=>{if(mapInstance)google.maps.event.trigger(mapInstance,'resize');});}
      return;
    }
    const latitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='latitude').value,longitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='longitude').value;
    const mapUrl=new URL('https://www.google.com/maps/@');mapUrl.searchParams.set('api','1');mapUrl.searchParams.set('map_action','map');mapUrl.searchParams.set('center',`${latitude},${longitude}`);mapUrl.searchParams.set('zoom','17');mapUrl.searchParams.set('basemap','satellite');
    mapLink.href=mapUrl.toString();mapLink.hidden=false;status.textContent=`Satellite view at ${latitude.toFixed(2)}, ${longitude.toFixed(2)}.`;
    mapTimer=setTimeout(()=>displaySatelliteMap(latitude,longitude),immediate?0:450);
  };
  const set=(key,value)=>{
    const axis=axes.find(item=>item.dataset.coordinateAxis===key);if(!axis)return;const parts=decimalToDms(value,key);
    axis.querySelector('[data-coordinate-part="degrees"]').value=parts.degrees;axis.querySelector('[data-coordinate-part="minutes"]').value=parts.minutes;axis.querySelector('[data-coordinate-part="seconds"]').value=parts.seconds;
    const decimalInput=form.querySelector(`[data-coordinate-decimal-for="${key}"]`);if(decimalInput)decimalInput.value=decimalMode()&&value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?String(Number(Number(value).toFixed(7))):'';
    setHemisphere(axis,parts.hemisphere);
  };
  if(addressButton)addressButton.onclick=async()=>{
    const target=form.elements.namedItem(preview.dataset.addressTarget);
    if(!target)return;
    if(!window.isSecureContext){addressStatus.textContent='Location access requires a secure HTTPS connection.';return;}
    if(!navigator.geolocation){addressStatus.textContent='This browser does not support location access. Enter the coordinates manually.';return;}
    addressButton.disabled=true;addressButton.textContent='Getting location…';addressStatus.textContent='Allow location access in your browser to fill the coordinates.';
    try{
      let position;
      try{
        position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}));
      }catch(error){
        addressStatus.textContent=error.code===1?'Location permission was denied. Allow it in your browser settings and try again.':error.code===3?'Location request timed out. Try again or enter the coordinates manually.':'Could not determine your location. Check your device location settings and try again.';
        return;
      }
      const latitude=position.coords.latitude,longitude=position.coords.longitude;
      set('latitude',latitude);set('longitude',longitude);refresh(true);
      addressButton.textContent='Finding address…';addressStatus.textContent='Coordinates added. Looking up the address…';
      const delay=Math.max(0,1100-(Date.now()-lastAddressLookup));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastAddressLookup=Date.now();
      const endpoint=new URL('https://nominatim.openstreetmap.org/reverse');endpoint.searchParams.set('format','jsonv2');endpoint.searchParams.set('lat',latitude);endpoint.searchParams.set('lon',longitude);
      const response=await fetch(endpoint,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Address lookup failed.');const place=await response.json();if(!place.display_name)throw new Error('No address found.');
      target.value=place.display_name;addressStatus.textContent='Location and address added. Review them before saving.';
    }catch(error){addressStatus.textContent='Coordinates were filled, but the address lookup failed. Check your connection or enter the address manually.';console.warn('Address lookup failed:',error);}
    finally{addressButton.disabled=false;addressButton.textContent='Get Address';}
  };
  axes.forEach(axis=>{
    const decimalInput=form.querySelector(`[data-coordinate-decimal-for="${axis.dataset.coordinateAxis}"]`);
    axis.querySelectorAll('input,select').forEach(input=>{const updateFromDms=()=>{if(decimalInput){decimalInput.value='';decimalInput.setCustomValidity('');decimalInput.removeAttribute('aria-invalid');}refresh();};input.addEventListener('input',updateFromDms);input.addEventListener('change',updateFromDms);});
    decimalInput?.addEventListener('input',()=>refresh());decimalInput?.addEventListener('change',()=>refresh());
  });
  const modeButtons=[...form.querySelectorAll('[data-coord-mode-button]')];
  const setMode=mode=>{
    if(!modeButtons.length)return;
    if(mode==='dd')axes.forEach(axis=>{const decimalInput=form.querySelector(`[data-coordinate-decimal-for="${axis.dataset.coordinateAxis}"]`),hidden=axis.querySelector('[data-coordinate-value]');if(decimalInput&&decimalInput.value.trim()===''&&hidden.value!=='')decimalInput.value=String(Number(hidden.value));});
    else{refresh();form.querySelectorAll('[data-coordinate-decimal-for]').forEach(input=>{input.value='';input.setCustomValidity('');input.removeAttribute('aria-invalid');});}
    form.dataset.coordMode=mode;modeButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.coordModeButton===mode)));
    form.querySelectorAll('[data-coord-panel]').forEach(panel=>panel.hidden=panel.dataset.coordPanel!==mode);refresh(true);
  };
  modeButtons.forEach(button=>button.onclick=()=>setMode(button.dataset.coordModeButton));
  refresh(true);
  return {set,refresh,validate(){refresh(true);const values=axes.map(readAxis);values.forEach((value,index)=>{if(value.missing){const degree=(decimalMode()&&form.querySelector(`[data-coordinate-decimal-for="${axes[index].dataset.coordinateAxis}"]`))||axes[index].querySelector('[data-coordinate-part="degrees"]');degree.setCustomValidity('Enter this coordinate as DMS or decimal degrees.');degree.setAttribute('aria-invalid','true');}});return values.every(value=>value.valid);}};
}
function bindGeneric(view,table,fieldsList,columns,defaults={},withAccounts=false) {
  const records=[];const form=view.querySelector('#record-form');let editing=null;const coordinateEditor=bindCoordinateEditor(form),memberFormPanel=view.querySelector('[data-member-form-panel]'),addMemberButton=view.querySelector('[data-add-member]'),importPanel=view.querySelector('[data-member-import-panel]'),importFile=view.querySelector('#member-import-file');let pendingImportRows=[];
  // Race points: the form opens in a pop-up (add or edit) and is hidden otherwise.
  const pointDialog=view.querySelector('[data-race-point-dialog]');
  const setMemberFormOpen=open=>{
    if(pointDialog){if(open&&!pointDialog.open){pointDialog.showModal();coordinateEditor.refresh(true);}else if(!open&&pointDialog.open)pointDialog.close();return;}
    if(!memberFormPanel)return;memberFormPanel.hidden=!open;addMemberButton.hidden=open;};
  if(pointDialog){
    view.querySelector('[data-add-race-point]').onclick=()=>{view.querySelector('#cancel-edit').click();setMemberFormOpen(true);form.elements.namedItem('location')?.focus();};
    view.querySelector('[data-close-race-point]').onclick=()=>view.querySelector('#cancel-edit').click();
    // Closed with Esc or the back gesture: forget the edit too.
    pointDialog.addEventListener('close',()=>{if(editing)view.querySelector('#cancel-edit').click();});
  }
  if(addMemberButton)addMemberButton.onclick=()=>{editing=null;form.reset();coordinateEditor.refresh(true);form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);form.querySelector('#cancel-edit').hidden=false;form.querySelector('[type=submit]').textContent=form.dataset.submitLabel||'Save';view.querySelector('[data-form-title]').textContent='Add a member';setMemberFormOpen(true);memberFormPanel.scrollIntoView({behavior:'smooth',block:'start'});};
  const redraw=()=>{
    // Race points: no Actions column; the location opens the pop-up (edit or delete there).
    view.querySelector('[data-table]').innerHTML=tableRows(records,columns,'Nothing here yet.',!pointDialog);
    view.querySelectorAll('[data-edit-point]').forEach(btn=>btn.onclick=()=>openEdit(records.find(r=>String(r.id)===btn.dataset.editPoint)));
    view.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>openEdit(records[Number(btn.dataset.edit)]));
    function openEdit(record){
      if(!record)return;editing=record;
      for(const [key,,type,,options] of fieldsList){if(type==='coordinates'){coordinateEditor.set(key,editing[key]);continue;}const el=form.elements.namedItem(key);if(!el)continue;if(type==='radio'){const saved=String(editing[key]??'').trim().toLowerCase();el.value=options.find(option=>option.toLowerCase()===saved||(saved&&option.toLowerCase()[0]===saved[0]))||'';continue;}el.value=editing[key]??(key==='paid'?0:'');}
      coordinateEditor.refresh(true);view.querySelector('#cancel-edit').hidden=false;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=true);form.querySelector('[type=submit]').textContent='Update record';if(memberFormPanel){view.querySelector('[data-form-title]').textContent='Edit member';setMemberFormOpen(true);memberFormPanel.scrollIntoView({behavior:'smooth',block:'start'});}else{const title=view.querySelector('[data-form-title]');if(title)title.textContent='Edit race point';const del=view.querySelector('[data-delete-point]');if(del)del.hidden=false;setMemberFormOpen(true);}
    }
    view.querySelectorAll('[data-login]').forEach(btn=>btn.onclick=async()=>{const username=(prompt('Choose a username for this member (letters, numbers, . _ -):')||'').trim().toLowerCase();if(!username)return;if(!USERNAME_RE.test(username)){alert(USERNAME_HELP);return;}const password=prompt('Choose a password (8 or more characters):')||'';if(!password)return;if(password.length<8){alert('Password must be at least 8 characters.');return;}if(!confirm(`Create a member login for ${username}?`))return;const {error}=await supabase.rpc('admin_create_member_account',{p_member_id:Number(btn.dataset.login),p_username:username,p_password:password});if(error){alert(authError(error));return;}await load();alert(`Member login created. Username: ${username}`);});
    view.querySelectorAll('[data-member-username]').forEach(btn=>btn.onclick=async()=>{const username=prompt('Enter the new member username:',btn.dataset.currentUsername);if(username===null)return;const normalized=username.trim().toLowerCase();if(!USERNAME_RE.test(normalized)){alert(USERNAME_HELP);return;}if(normalized===btn.dataset.currentUsername){alert('The username has not changed.');return;}if(!confirm(`Update this member login to ${normalized}?`))return;const {error}=await supabase.rpc('admin_update_user_credentials',{p_user_id:btn.dataset.memberUsername,p_username:normalized,p_password:null});if(error){alert(authError(error));return;}await load();alert(`Member username updated to ${normalized}.`);});
    view.querySelectorAll('[data-send-confirm]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;const note=await sendEmailConfirm(Number(btn.dataset.sendConfirm));btn.disabled=false;message(note.trim(),note.includes('not sent')?'error':'success');});
    view.querySelectorAll('[data-reset]').forEach(btn=>btn.onclick=async()=>{const password=prompt('Enter a new password (8 or more characters):')||'';if(!password)return;if(password.length<8){alert('Password must be at least 8 characters.');return;}if(!confirm('Update this member’s password?'))return;const {error}=await supabase.rpc('admin_set_member_password',{p_member_id:Number(btn.dataset.reset),p_password:password});if(error){alert(authError(error));return;}alert('Member password updated.');});
    view.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm(withAccounts?'Delete this member and their login?':'Delete this record?'))return;const {error}=await supabase.from(table).delete().eq('id',btn.dataset.delete);if(error){message(dbError(error),'error');return;}await load();message('Record deleted.','success');});
  };
  async function load(){const {data,error}=await supabase.from(table).select('*').order('id',{ascending:false});if(error){fail(error);return;}if(withAccounts){const {data:profiles}=await supabase.from('app_profiles').select('id,username,member_id').eq('role','member');const byMember=new Map((profiles||[]).map(p=>[String(p.member_id),{user_id:p.id,username:p.username}]));(data||[]).forEach(r=>Object.assign(r,byMember.get(String(r.id))||{username:null,user_id:null}));}records.splice(0,records.length,...(data||[]));view.querySelector('[data-count]').textContent=`${records.length} records`;redraw();}
  if(importPanel&&importFile){
    const openButton=view.querySelector('[data-open-member-import]'),summary=importPanel.querySelector('[data-import-summary]'),errorsNode=importPanel.querySelector('[data-import-errors]'),previewNode=importPanel.querySelector('[data-import-preview]'),importButton=importPanel.querySelector('[data-confirm-member-import]');
    const showImportPreview=(rows,issues)=>{
      pendingImportRows=rows;summary.textContent=`${rows.length} ready · ${issues.length} issue${issues.length===1?'':'s'}`;
      errorsNode.innerHTML=issues.length?`<div class="notice error"><strong>Fix these spreadsheet rows before importing:</strong><ul class="import-issue-list">${issues.slice(0,20).map(issue=>`<li>Row ${escapeHTML(issue.rowNumber)}: ${issue.errors.map(escapeHTML).join(' ')}</li>`).join('')}${issues.length>20?`<li>And ${issues.length-20} more issue(s).</li>`:''}</ul></div>`:'';
      previewNode.innerHTML=rows.length?`<p class="small">Previewing the first ${Math.min(rows.length,8)} of ${rows.length} members. No login accounts are created.</p>${tableRows(rows.slice(0,8),[{key:'member_no',label:'Member ID'},{key:'full_name',label:'Full name'},{key:'loft_name',label:'Loft name'},{key:'latitude',label:'Latitude · DD',render:r=>coord2(r.latitude)},{key:'longitude',label:'Longitude · DD',render:r=>coord2(r.longitude)}],'No member rows found.',false)}`:'<p class="small">No valid member rows to preview.</p>';
      importButton.disabled=!rows.length||issues.length>0;importPanel.hidden=false;importPanel.scrollIntoView({behavior:'smooth',block:'start'});
    };
    openButton.onclick=()=>importFile.click();
    view.querySelector('[data-download-member-template]').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const XLSX=await loadSpreadsheetParser(),workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['Member ID','Full name','First name','Middle name','Last name','Loft name','Address','Phone','Membership paid','Latitude Hemisphere (N/S)','Latitude Degrees','Latitude Minutes','Latitude Seconds','Longitude Hemisphere (E/W)','Longitude Degrees','Longitude Minutes','Longitude Seconds']]);
        sheet['!cols']=[{wch:18},{wch:26},{wch:18},{wch:18},{wch:18},{wch:24},{wch:32},{wch:18},{wch:18},{wch:24},{wch:16},{wch:16},{wch:16},{wch:26},{wch:17},{wch:17},{wch:17}];
        XLSX.utils.book_append_sheet(workbook,sheet,'Members');XLSX.writeFile(workbook,'avilonx-members-template.xlsx');
        message('Excel template downloaded. Fill one member per row; enter each coordinate as hemisphere, degrees, minutes, and seconds.','success');
      }catch(error){message(error.message||'Could not create the Excel template.','error');}
      finally{button.disabled=false;}
    };
    importFile.onchange=async()=>{
      const file=importFile.files?.[0];if(!file)return;
      importPanel.hidden=false;summary.textContent='Reading file…';errorsNode.innerHTML='';previewNode.innerHTML='';importButton.disabled=true;
      try{
        if(file.size>10*1024*1024)throw new Error('Choose an Excel file smaller than 10 MB.');
        const XLSX=await loadSpreadsheetParser(),parsed=parseMemberWorksheet(XLSX,await file.arrayBuffer()),issues=[...parsed.issues];
        if(!parsed.dataRows)issues.push({rowNumber:'—',errors:['No member rows were found below the heading row.']});
        if(parsed.members.length){
          const existing=new Set();
          for(let offset=0;offset<parsed.members.length;offset+=100){
            const batch=parsed.members.slice(offset,offset+100).map(member=>member.member_no),{data,error}=await supabase.from('members').select('member_no').in('member_no',batch);
            if(error)throw error;(data||[]).forEach(member=>existing.add(member.member_no.toLocaleLowerCase()));
          }
          parsed.members.forEach(member=>{if(existing.has(member.member_no.toLocaleLowerCase()))issues.push({rowNumber:member.__rowNumber,errors:[`Member ID ${member.member_no} already exists in this club.`]});});
        }
        showImportPreview(parsed.members,issues);
      }catch(error){showImportPreview([],[{rowNumber:'—',errors:[error.message||'Could not read this file.']}]);}
      finally{importFile.value='';}
    };
    importPanel.querySelector('[data-cancel-member-import]').onclick=()=>{pendingImportRows=[];importPanel.hidden=true;importFile.value='';};
    importButton.onclick=async()=>{
      if(!pendingImportRows.length)return;
      if(!confirm(`Import ${pendingImportRows.length} member records into this club? No login accounts will be created.`))return;
      importButton.disabled=true;importButton.textContent='Importing…';
      const rows=pendingImportRows.map(({__rowNumber,...member})=>member),{error}=await supabase.from('members').insert(rows);
      importButton.textContent='Import members';
      if(error){importButton.disabled=false;message(dbError(error),'error');return;}
      const imported=rows.length;pendingImportRows=[];importPanel.hidden=true;await load();message(`${imported} member${imported===1?'':'s'} imported successfully. Create member login accounts separately if needed.`,'success');
    };
  }
  form.onsubmit=async event=>{event.preventDefault();if(!coordinateEditor.validate()){message('Check the latitude and longitude values, then try again.','error');form.reportValidity();return;}const data=Object.fromEntries(fieldsList.map(([key,,type])=>{const value=form.elements.namedItem(key).value;return [key,type==='number'||type==='coordinates'?Number(value):key==='paid'?Number(value):value.trim()||null];}));Object.assign(data,defaults);const accUser=withAccounts?(form.elements.namedItem('account_username')?.value||'').trim().toLowerCase():'',accPass=withAccounts?(form.elements.namedItem('account_password')?.value||''):'';if(!editing&&withAccounts&&(accUser||accPass)&&(!accUser||accPass.length<8)){message('To create a login, enter a username and a password of 8 or more characters.','error');return;}if(!editing&&withAccounts&&accUser&&!USERNAME_RE.test(accUser)){message(USERNAME_HELP,'error');return;}if(!editing&&withAccounts&&accUser&&!confirm(`Create the member and a login for ${accUser}?`))return;const recalcNote=editing&&table==='race_points'?await confirmRacePointMove(editing,data):'';if(recalcNote===null)return;const result=editing?await supabase.from(table).update(data).eq('id',editing.id):await supabase.from(table).insert(data).select('id').single();if(result.error){message(dbError(result.error),'error');return;}const emailNote=table==='members'&&data.email&&(!editing||String(editing.email||'')!==data.email.toLowerCase())?await sendEmailConfirm(editing?editing.id:result.data.id):'';let accountNote='';if(!editing&&withAccounts&&accUser&&accPass){const {error:accError}=await supabase.rpc('admin_create_member_account',{p_member_id:result.data.id,p_username:accUser,p_password:accPass});accountNote=accError?` Member saved, but the login failed: ${authError(accError)} Use “Create login” in the list to retry.`:` Login created for ${accUser}.`;}form.reset();coordinateEditor.refresh(true);editing=null;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);view.querySelector('#cancel-edit').hidden=form.dataset.keepCancel!=='true';form.querySelector('[type=submit]').textContent=form.dataset.submitLabel||'Save';view.querySelector('[data-form-title]').textContent=memberFormPanel?'Add a member':'Add a race point';await load();setMemberFormOpen(false);message('Saved.'+accountNote+(recalcNote||'')+emailNote,accountNote.includes('failed')||emailNote.includes('not sent')?'error':'success');if(accountNote&&!accountNote.includes('failed'))alert(`Member account created. Username: ${accUser}`);};
  const deletePoint=view.querySelector('[data-delete-point]');
  if(deletePoint)deletePoint.onclick=async()=>{if(!editing||!confirm(`Delete the race point ${editing.location||''}?`))return;const {error}=await supabase.from(table).delete().eq('id',editing.id);if(error){message(dbError(error),'error');return;}view.querySelector('#cancel-edit').click();await load();message('Race point deleted.','success');};
  view.querySelector('#cancel-edit').onclick=()=>{if(deletePoint)deletePoint.hidden=true;form.reset();coordinateEditor.refresh(true);editing=null;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);view.querySelector('#cancel-edit').hidden=form.dataset.keepCancel!=='true';form.querySelector('[type=submit]').textContent=form.dataset.submitLabel||'Save';view.querySelector('[data-form-title]').textContent=memberFormPanel?'Add a member':'Add a race point';setMemberFormOpen(false);};load();
}

// A race point's name or coordinates changed: the races using it (open and
// closed) move with it and every entry's distance, speed and rank is worked out
// again by the database (race-point-recalc.sql). Asks first; returns the note
// for the saved message, '' when nothing is affected, or null when cancelled.
async function confirmRacePointMove(point,data){
  const moved=data.location!==point.location||Number(data.latitude)!==Number(point.latitude)||Number(data.longitude)!==Number(point.longitude);
  if(!moved)return '';
  // Same as the database (race-point-recalc.sql): races linked to this point, and
  // unlinked races of the same club named like it, only if no other point has that name.
  const [{data:races,error},{data:twins,error:twinError}]=await Promise.all([
    supabase.from('races').select('id,name,race_point_id,release_location,release_latitude,release_longitude,club_id'),
    supabase.from('race_points').select('id,latitude,longitude').eq('location',point.location).neq('id',point.id)
  ]);
  if(error||twinError){message(`Could not check which races use this race point, so nothing was saved: ${dbError(error||twinError)}`,'error');return null;}
  // Unlinked races: same name AND the point's old coordinates, unless another point
  // has that same name and those coordinates (then it may be the other point's).
  const samePlace=item=>Number(item.latitude??item.release_latitude)===Number(point.latitude)&&Number(item.longitude??item.release_longitude)===Number(point.longitude);
  const byName=!(twins||[]).some(samePlace);
  const affected=(races||[]).filter(race=>Number(race.race_point_id)===Number(point.id)||(byName&&race.race_point_id==null&&race.release_location===point.location&&samePlace(race)&&(point.club_id==null||Number(race.club_id)===Number(point.club_id))));
  if(!affected.length)return '';
  const {count,error:entryError}=await supabase.from('race_entries').select('id',{count:'exact',head:true}).in('race_id',affected.map(race=>race.id));
  if(entryError){message(`Could not count the entries of these races, so nothing was saved: ${dbError(entryError)}`,'error');return null;}
  const n=affected.length,m=count||0;
  const what=`${n} race${n===1?'':'s'} (${affected.slice(0,5).map(race=>race.name).join(', ')}${n>5?'…':''})`;
  if(!confirm(`This race point is used by ${what}.\n\nSaving moves ${n===1?'it':'them'} to the new location and recalculates the distance, speed and rank of ${m} entr${m===1?'y':'ies'}, clocked birds included, also in closed races.\n\nSave?`))return null;
  return ` ${n} race${n===1?'':'s'} moved to the new location; distance, speed and rank recalculated for ${m} entr${m===1?'y':'ies'}.`;
}

export async function renderCrud(view,table,canManageAccounts) {
  const isMembers=table==='members';
  const columns=isMembers?[
    {key:'member_no',label:'Member ID'},
    {key:'full_name',label:'Name'},
    {key:'loft_name',label:'Loft'},
    {key:'paid',label:'Paid',render:r=>r.paid?'Yes':'No'},
    {key:'email',label:'Email',render:r=>r.email?`${escapeHTML(r.email)} ${r.email_confirmed_at?'<span class="tag verified">✓ Confirmed</span>':`<span class="tag pending">Not confirmed</span> <button class="text-button" data-send-confirm="${escapeHTML(r.id)}">Send link again</button>`}`:'—'},
    ...(canManageAccounts?[{key:'username',label:'Login',render:r=>r.username?`${escapeHTML(r.username)} <button class="text-button" data-member-username="${escapeHTML(r.user_id)}" data-current-username="${escapeHTML(r.username)}">Change username</button><button class="text-button" data-reset="${escapeHTML(r.id)}">Reset password</button>`:`<button class="text-button" data-login="${escapeHTML(r.id)}">Create login</button>`}]:[])
  ]:[{key:'location',label:'Location',render:r=>`<button class="race-point-open" type="button" data-edit-point="${escapeHTML(r.id)}" title="Edit or delete">${escapeHTML(r.location||'—')}</button>`},{key:'sector',label:'Sector & coordinates',render:r=>`<span class="race-point-where">${escapeHTML(r.sector?titleCase(String(r.sector)):'—')} · <span class="race-point-coords">${coord2(r.latitude)}, ${coord2(r.longitude)}</span></span>`}];
  const accountFields=isMembers&&canManageAccounts?'<label class="field" data-account-field><span>Login username (optional)</span><input name="account_username" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false"></label><label class="field" data-account-field><span>Login password (8+ characters)</span><input name="account_password" type="password" minlength="8" autocomplete="new-password"></label>':'';
  const formMarkup=(isMembers?genericForm(fields[table]):racePointForm(fields[table])).replace('<div class="form-actions">',`${accountFields}<div class="form-actions">`);
  const formPanel=isMembers?`<section class="panel" data-member-form-panel hidden><div class="panel-heading"><h3 data-form-title>Add a member</h3></div>${formMarkup}</section>`:`<dialog class="race-point-dialog" data-race-point-dialog aria-labelledby="race-point-dialog-title"><section class="panel race-point-panel">${formMarkup}</section></dialog>`;
  const listPanel=`<section class="panel"><div class="panel-heading"><h3>${isMembers?'Member list':'Saved locations'}</h3>${isMembers?'':'<span class="race-point-list-actions"><span class="count-pill" data-count>— records</span><button class="button primary" type="button" data-add-race-point>＋ Add race point</button></span>'}${isMembers?'<div class="member-list-actions"><button class="button secondary" type="button" data-download-member-template>Excel template</button><button class="button secondary" type="button" data-open-member-import>Import Excel</button><input id="member-import-file" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden><button class="button primary" type="button" data-add-member>＋ Add member</button></div>':''}</div><div data-table></div></section>`;
  const importPanel=isMembers?`<section class="panel member-import-panel" data-member-import-panel hidden><div class="panel-heading"><div><h3>Excel import preview</h3><p class="small">Columns: Member ID, Full name, Loft name, Latitude, Longitude.</p></div><span class="count-pill" data-import-summary></span></div><div data-import-errors></div><div data-import-preview></div><div class="form-actions"><button class="button secondary" type="button" data-cancel-member-import>Cancel</button><button class="button primary" type="button" data-confirm-member-import disabled>Import members</button></div></section>`:'';
  view.innerHTML=`<div class="split-heading"><div><h2>${isMembers?'Members & lofts':'Race points'}</h2></div>${isMembers?'<span class="count-pill" data-count>— records</span>':''}</div>${isMembers?`${listPanel}${importPanel}${formPanel}`:`${formPanel}${listPanel}`}`;
  bindGeneric(view,table,fields[table],columns,{},isMembers&&canManageAccounts);
}
