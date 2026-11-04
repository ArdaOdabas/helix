import {spawn} from 'node:child_process';
const processes=[spawn(process.execPath,['src/server/main.ts'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];let exiting=false;function stop(code=0){if(exiting)return;exiting=true;for(const p of processes)p.kill();process.exitCode=code;}
for(const p of processes)p.on('exit',code=>stop(code??0));process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
