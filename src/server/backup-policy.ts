import { readdirSync,statSync,rmSync,lstatSync } from 'node:fs';
import path from 'node:path';
import { safeSubdir } from './backup.js';
export function pruneAutomaticBackups(dataDir:string){
 const dir=safeSubdir(dataDir,'backups'),files=readdirSync(dir).filter(name=>/^auto-\d{4}-\d{2}-\d{2}-.*\.sqlite$/.test(name));
 const days=[...new Set(files.map(name=>name.slice(5,15)))].sort().reverse();const keep=new Set(days.slice(0,14));
 for(const name of files)if(!keep.has(name.slice(5,15))){const file=path.join(dir,name);if(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink())rmSync(file);}
}
export function listBackups(dataDir:string){const dir=safeSubdir(dataDir,'backups');return readdirSync(dir).filter(name=>name.endsWith('.sqlite')&&!lstatSync(path.join(dir,name)).isSymbolicLink()&&lstatSync(path.join(dir,name)).isFile()).map(name=>({name,size:statSync(path.join(dir,name)).size,createdAt:statSync(path.join(dir,name)).mtime.toISOString()})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
