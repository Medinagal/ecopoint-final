import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';

const html = readFileSync('public/index.html', 'utf8');
const client = readFileSync('public/api-client.js', 'utf8');
for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
 if (script.trim()) parse(script, {ecmaVersion: 'latest', sourceType: 'script'});
}
parse(client, {ecmaVersion: 'latest', sourceType: 'script'});
assert.ok(html.includes('src="/api-client.js"'));
assert.ok(html.includes('canServiceStation'));
assert.ok(!html.includes('ecopoint-preview-v2'));
assert.ok(!client.includes('previewSignIn'));
assert.ok(!html.includes('EcoPoint-Preview-Only-2026'));
assert.ok(!client.includes('EcoPoint-Preview-Only-2026'));
for (const path of ['netlify/functions/api.mjs', 'worker/index.js']) {
 parse(readFileSync(path, 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'});
}
console.log('PASS generated frontend, function syntax and absence of offline password shortcuts');
