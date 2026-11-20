export function localD1(sql){
 const wrap=(query,values=[])=>({
  bind(...args){return wrap(query,args)},
  async first(){return sql.prepare(query).get(...values)||null},
  async all(){return {results:sql.prepare(query).all(...values)}},
  execute(){const r=sql.prepare(query).run(...values);return {meta:{changes:r.changes}}},
  async run(){return this.execute()}
 });
 return {prepare:query=>wrap(query),async batch(statements){
  sql.exec('BEGIN IMMEDIATE');
  try{const r=statements.map(s=>s.execute());sql.exec('COMMIT');return r}
  catch(e){sql.exec('ROLLBACK');throw e}
 }};
}
