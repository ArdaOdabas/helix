// Offline fallback: run the same assertion bodies under Node's test runner.
// This does not substitute for the documented Vitest release check.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='.native-tests';mkdirSync(dir,{recursive:true});try{for(const f of readdirSync('tests').filter(f=>f.endsWith('.test.ts'))){writeFileSync(dir+'/'+f,readFileSync('tests/'+f,'utf8').replace("from 'vitest'","from 'node:test'"));}const r=spawnSync(process.execPath,['--test',...readdirSync(dir).map(f=>dir+'/'+f)],{stdio:'inherit'});process.exitCode=r.status??1;}finally{rmSync(dir,{recursive:true,force:true});}
