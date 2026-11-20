import {getDatabase} from '@netlify/database';
import {postgresStore} from '../lib/postgres.js';
import {createHandler} from '../lib/handler.js';

let store;

export default createHandler(
 () => store ??= postgresStore(getDatabase().pool),
 () => process.env.EP_BOOTSTRAP_PASSWORD,
 () => ({STORAGE_NAME: 'PostgreSQL'})
);
export const config = {path: '/api/*'};
