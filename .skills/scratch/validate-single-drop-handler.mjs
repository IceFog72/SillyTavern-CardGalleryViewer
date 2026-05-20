import { readFileSync } from 'node:fs';

const source = readFileSync('src/index.js', 'utf8');
const checks = [
    ['does not import DragAndDropHandler', !/import \{ DragAndDropHandler \}/.test(source)],
    ['tracks a drop abort controller', /this\.dropAbortController = null;/.test(source)],
    ['aborts old drop handlers before rebinding', /this\.destroyDropHandler\(\);[\s\S]*this\.dropAbortController = new AbortController\(\);/.test(source)],
    ['binds drop once with abort signal', /host\.addEventListener\('drop',[\s\S]*signal/.test(source)],
];
let failed = false;
for (const [name, ok] of checks) {
    if (ok) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failed = true; }
}
process.exit(failed ? 1 : 0);
