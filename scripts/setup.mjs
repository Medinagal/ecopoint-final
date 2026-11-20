import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!existsSync('.env'))writeFileSync('.env','EP_BOOTSTRAP_PASSWORD='+randomBytes(24).toString('base64url')+'\n',{mode:0o600});
mkdirSync('.data',{recursive:true});
console.log('Local setup ready. Test-account password is in ignored .env; never commit or record it in the demo video.');
