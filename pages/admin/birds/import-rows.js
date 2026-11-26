// Band Assignments → Import Excel: reads the spreadsheet rows (no browser or
// database needed, so it can be tested on its own).
const normalizeImportHeader=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');

export const NO_PHOTO = 'no-photo-yet';
export const TEMPLATE = [['Member ID', 'Ring number', 'Bird name', 'Colour', 'Sex', 'Hatch year', 'RFID tag'], ['M-01', 'PH-2026-000123', 'Blue Lightning', 'Blue bar', 'cock', 2026, '843519DB'], ['M-02', 'PH-2026-000124', 'Red Rocket', 'Red check', 'hen', 2026, '']];
const HEADERS = {
  member: ['memberid', 'memberno', 'membernumber', 'member'],
  ring: ['ringnumber', 'ring', 'band', 'bandnumber', 'ringno'],
  name: ['birdname', 'name', 'pigeonname'],
  color: ['colour', 'color'],
  sex: ['sex', 'gender'],
  year: ['hatchyear', 'year', 'hatch'],
  tag: ['rfidtag', 'rfid', 'nfctag', 'tag', 'chip'],
};

// rows: arrays from the sheet (first row = headers). members: {id, member_no, loft_name}.
// existingRings: ring numbers already bonded in the club (upper case).
export function parseBirdRows(matrix, members, existingRings = new Set()) {
  const head = (matrix[0] || []).map(normalizeImportHeader);
  const col = Object.fromEntries(Object.entries(HEADERS).map(([key, names]) => [key, head.findIndex(h => names.includes(h))]));
  const missing = ['member', 'ring', 'name', 'color'].filter(key => col[key] < 0);
  if (missing.length) return { rows: [], issues: [{ rowNumber: 1, errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.map(k => TEMPLATE[0][['member', 'ring', 'name', 'color', 'sex', 'year', 'tag'].indexOf(k)]).join(', ')}`] }] };
  const byNo = new Map(members.map(m => [String(m.member_no).trim().toUpperCase(), m]));
  const seen = new Set(), seenTags = new Set(), rows = [], issues = [];
  matrix.slice(1).forEach((cells, i) => {
    const get = key => col[key] < 0 ? '' : String(cells[col[key]] ?? '').trim();
    if (!cells.some(cell => String(cell ?? '').trim())) return;
    const rowNumber = i + 2, errors = [];
    const member = byNo.get(get('member').toUpperCase());
    const ring = get('ring').toUpperCase(), tag = get('tag').toUpperCase().replace(/[\s:-]/g, '');
    const sexText = get('sex').toLowerCase(), sex = /^(c|cock|m|male)$/.test(sexText) ? 'cock' : /^(h|hen|f|female)$/.test(sexText) ? 'hen' : null;
    const year = get('year') ? Number(get('year')) : null;
    if (!member) errors.push(`member "${get('member') || '(empty)'}" is not in this club`);
    if (!ring) errors.push('ring number is empty');
    else if (existingRings.has(ring)) errors.push(`ring ${ring} is already bonded`);
    else if (seen.has(ring)) errors.push(`ring ${ring} is listed twice`);
    if (!get('name')) errors.push('bird name is empty');
    if (!get('color')) errors.push('colour is empty');
    if (sexText && !sex) errors.push(`sex "${get('sex')}" should be cock or hen`);
    if (year !== null && !(Number.isInteger(year) && year >= 1990 && year <= 2100)) errors.push(`hatch year "${get('year')}" is not a year`);
    if (tag && !/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(tag)) errors.push(`RFID tag "${get('tag')}" should be 8, 14 or 20 letters 0-9 / A-F`);
    else if (tag && seenTags.has(tag)) errors.push(`RFID tag ${tag} is listed twice`);
    seen.add(ring); if (tag) seenTags.add(tag);
    if (errors.length) { issues.push({ rowNumber, errors }); return; }
    rows.push({ rowNumber, record: { member_id: member.id, ring_number: ring, bird_name: get('name'), color: get('color'), loft_name: member.loft_name || member.full_name || 'Loft', sex, hatch_year: year, nfc_tag: tag || null, bond_type: tag ? 'rfid' : 'ring', photo_path: NO_PHOTO, status: 'active' } });
  });
  return { rows, issues };
}

