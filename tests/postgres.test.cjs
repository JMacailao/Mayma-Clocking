const { PGlite } = require('@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function queryFrom(file, fragment) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const matches = [...source.matchAll(/(?:prepare|query)\((['"])([\s\S]*?)\1\)/g)];
  const sql = matches.map(m => m[2]).find(sql => sql.includes(fragment));
  assert.ok(sql, `Missing query in ${file}: ${fragment}`);
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}
test('PostgreSQL schema and application SQL', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    const schema = readFileSync(path.join(root, 'schema.sql'), 'utf8');
    await db.exec(schema);
    await db.exec(schema); // Safe repeat on the same PostgreSQL schema.
    let checked = 0;
    for (const file of readdirSync(root).filter(f => f.endsWith('.php'))) {
      const source = readFileSync(path.join(root,file),'utf8');
      for (const match of source.matchAll(/(?:prepare|query)\((['"])([\s\S]*?)\1\)/g)) {
        let n = 0;
        const sql = match[2].replace(/\?/g, () => `$${++n}`);
        await db.exec(`PREPARE check_${checked} AS ${sql}; DEALLOCATE check_${checked};`);
        checked++;
      }
    }
    assert.ok(checked >= 40, `Only ${checked} application queries checked`);
    await db.exec(`
      INSERT INTO admins(username,password_hash) VALUES ('admin','test-hash');
      INSERT INTO members(member_no,full_name,loft_name,latitude,longitude)
        VALUES ('M1','Test Member','Test Loft',14,120), ('M2','Other Member','Other Loft',15,121);
      INSERT INTO race_points(location,sector,latitude,longitude) VALUES ('Release','South',13,119);
      INSERT INTO races(name,race_point_id,release_location,release_latitude,release_longitude,release_at_utc,status)
        VALUES ('Test race',1,'Release',13,119,'2020-01-01 00:00:00','open');
      INSERT INTO race_entries(race_id,member_id,pigeon_ring,barcode,distance_m)
        VALUES (1,1,'RING1','ExactCode',100000);
    `);
    const lookup = queryFrom('clocking_service.php', 'SELECT e.id,e.pigeon_ring');
    assert.equal((await db.query(lookup,[1,1,'ExactCode'])).rows.length,1);
    assert.equal((await db.query(lookup,[1,1,'exactcode'])).rows.length,0);
    assert.equal((await db.query(lookup,[1,2,'ExactCode'])).rows.length,0);
    const clock = queryFrom('clocking_service.php', 'SELECT clock_timestamp()');
    const time = Object.values((await db.query(clock)).rows[0])[0];
    assert.ok(time);
    const insert = queryFrom('clocking_service.php', 'INSERT INTO clock_events');
    const receipt = await db.query(insert,[1,'RING1',time,'barcode']);
    assert.equal(receipt.rows[0].id,1);
    await assert.rejects(db.query(insert,[1,'RING1',time,'sms']), e => e.code === '23514');
    await assert.rejects(db.query(insert,[1,'OTHER-RING',time,'barcode']), e => e.code === '23505');
    const upsert = queryFrom('member_access.php','INSERT INTO member_auth');
    await db.query(upsert,[1,'first-hash']); await db.query(upsert,[1,'reset-hash']);
    assert.equal((await db.query('SELECT pin_hash FROM member_auth')).rows[0].pin_hash,'reset-hash');
    const races = await db.query(queryFrom('races.php','SELECT r.*, p.sector'));
    assert.equal(Number(races.rows[0].entry_count),1);
    const dashboard = await db.query(queryFrom('member_dashboard.php','SELECT r.id,r.name'),[1]);
    assert.equal(Number(dashboard.rows[0].pigeon_count),1);
    const history = await db.query(queryFrom('member_history.php','SELECT r.name'),[1]);
    assert.equal(history.rows[0].pigeon_ring,'RING1');
    const results = await db.query(queryFrom('results.php','SELECT e.id, e.pigeon_ring'),[1]);
    assert.equal(Number(results.rows[0].distance_m),100000);
    await db.exec("UPDATE members SET full_name='Updated' WHERE id=1");
    assert.ok((await db.query('SELECT updated_at >= created_at AS touched FROM members WHERE id=1')).rows[0].touched);
    const tables = await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'");
    assert.equal(tables.rows.length,7);
    assert.ok(tables.rows.every(t => t.relrowsecurity));
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT password_hash FROM public.admins'), e => e.code === '42501');
      await assert.rejects(db.query('SELECT barcode FROM public.race_entries'), e => e.code === '42501');
      await db.exec('RESET ROLE');
    }
    await assert.rejects(db.query("INSERT INTO races(name,release_location,release_latitude,release_longitude,release_at_utc,status) VALUES ('Bad','X',0,0,NOW(),'invalid')"), e => e.code === '23514');
    await assert.rejects(db.query("INSERT INTO race_entries(race_id,member_id,pigeon_ring,barcode,distance_m) VALUES (1,999,'BAD','BAD',1)"), e => e.code === '23503');
  } finally { await db.close(); }
});
