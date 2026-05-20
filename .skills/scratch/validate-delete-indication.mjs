import { readFileSync } from 'node:fs';

const source = readFileSync('src/index.js', 'utf8');
const styles = readFileSync('style.css', 'utf8');

const checks = [
    ['renders delete warning banner', /<div class="cgv--deleteBanner">Delete mode active/.test(source)],
    ['delete button has icon and label spans', /<button class="menu_button cgv--delete"[\s\S]*<span class="cgv--deleteLabel">Delete<\/span>/.test(source)],
    ['delete toggle calls updateDeleteMode', /this\.updateDeleteMode\(event\.currentTarget\);/.test(source)],
    ['updateDeleteMode sets button label', /deleteLabel\.textContent = this\.deleteMode \? 'Delete ON' : 'Delete';/.test(source)],
    ['updateDeleteMode toggles panel class', /panel\?\.classList\.toggle\('cgv--deleteMode', this\.deleteMode\);/.test(source)],
    ['css shows banner in delete mode', /\.cgv--deleteMode \.cgv--deleteBanner \{ display: block; \}/.test(styles)],
    ['css styles active delete button', /\.cgv--deleteActive[\s\S]*background:[\s\S]*var\(--warnColor/.test(styles)],
    ['css changes thumbnail cursor in delete mode', /\.cgv--deleteMode #cgv--dragGallery[\s\S]*cursor:.*not-allowed/.test(styles)],
];

let failed = false;
for (const [name, ok] of checks) {
    if (ok) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failed = true; }
}
process.exit(failed ? 1 : 0);
