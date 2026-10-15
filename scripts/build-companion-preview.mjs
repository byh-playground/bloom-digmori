import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
// Reuse the repository's actual art, animation and Renderer; never boot the game App.
const files=JSON.parse(readFileSync('src/order.json','utf8')).filter(f=>f!=='runtime/boot.js');
const engine=files.map(f=>readFileSync('src/'+f,'utf8')).join('\n');
const preview=readFileSync('previews/companion-combat/preview.js','utf8');
const code=engine+'\n'+preview;
const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:code,encoding:'utf8'});
if(check.status)throw Error(check.stderr);
const html=readFileSync('previews/companion-combat/shell.html','utf8').replace('<!-- DIGMORI_PREVIEW -->',()=>'<script type="module">\n'+code+'\n</script>');
mkdirSync('dist/previews/companion-combat',{recursive:true});
writeFileSync('dist/previews/companion-combat/index.html',html);
console.log('Built preview only: dist/previews/companion-combat/index.html');
