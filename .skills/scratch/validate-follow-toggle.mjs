import { readFileSync } from 'node:fs';

const source = readFileSync('src/index.js', 'utf8');

const checks = [
    ['renders follow as a checkbox input', /<input class="cgv--follow" type="checkbox" checked>/],
    ['renders a label for the follow checkbox', /<label class="checkbox_label cgv--followLabel">/],
    ['change handler reads checked state', /this\.followCurrent = event\.currentTarget\.checked;/],
    ['manual card selection unchecks follow toggle', /follow\.checked = false;/],
];

let failed = false;
for (const [name, pattern] of checks) {
    if (pattern.test(source)) {
        console.log(`PASS ${name}`);
    } else {
        console.error(`FAIL ${name}`);
        failed = true;
    }
}

process.exit(failed ? 1 : 0);
