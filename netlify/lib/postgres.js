// Only the three statements used by the state store are supported.
const statements = new Map([
 ['SELECT body,version FROM ecopoint_state WHERE id=?', 'SELECT body,version FROM ecopoint_state WHERE id=$1'],
 ['INSERT OR IGNORE INTO ecopoint_state(id,version,body) VALUES(?,0,?)', 'INSERT INTO ecopoint_state(id,version,body) VALUES($1,0,$2) ON CONFLICT (id) DO NOTHING'],
 ['UPDATE ecopoint_state SET body=?,version=version+1 WHERE id=? AND version=?', 'UPDATE ecopoint_state SET body=$1,version=version+1 WHERE id=$2 AND version=$3']
]);
export function postgresStore(pool) {
 return {prepare(statement) {
  const text=statements.get(statement);
  if(!text) throw new Error('Unsupported state-store statement');
  return {bind(...values) {return {
   async first() {return (await pool.query(text,values)).rows[0] ?? null},
   async run() {const result=await pool.query(text,values);return {meta:{changes:result.rowCount ?? result.affectedRows}}}
  }}};
 }};
}
