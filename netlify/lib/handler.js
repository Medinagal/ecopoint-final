import worker from '../../worker/index.js';
export function createHandler(getStore,getPassword,getOptions=()=>({})) {
 return async request => {
  try {
   return await worker.fetch(request,{DB:getStore(),EP_BOOTSTRAP_PASSWORD:getPassword(),...getOptions()});
  } catch {
   return Response.json({error:'База данных недоступна. Проверьте настройки Netlify.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
 };
}
