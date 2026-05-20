import { readFileSync } from 'node:fs';

const css = readFileSync('style.css', 'utf8');
const js = readFileSync('src/index.js', 'utf8');

const checks = [
    ['toolbar wraps compactly', /\.cgv--toolbar \{[\s\S]*flex-wrap: wrap;[\s\S]*gap: 4px;/.test(css)],
    ['toolbar buttons are compact', /\.cgv--toolbar \.menu_button \{[\s\S]*min-height: 24px;[\s\S]*padding: 2px 6px;/.test(css)],
    ['delete active avoids bigger outline', /\.cgv--deleteActive \{[\s\S]*box-shadow: inset 0 0 0 1px var\(--warnColor, orange\);/.test(css)],
    ['delete label does not change to longer text', !/Delete ON/.test(js)],
];

let failed = false;
for (const [name, ok] of checks) {
    if (ok) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failed = true; }
}
process.exit(failed ? 1 : 0);
