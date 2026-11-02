import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, realpathSync, lstatSync, chmodSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRoot, resolveDataDir } from './paths.js';
export function safeSubdir(dataDir: string, name: 'backups'|'exports'): string {
  const base = realpathSync(dataDir), target = path.join(base, name);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error('Folder kopii/eksportu nie może być dowiązaniem.');
  mkdirSync(target,{recursive:true,mode:0o700});
  const resolved=realpathSync(target);
  resolveDataDir(resolved, projectRoot);
  if(path.dirname(resolved)!==base) throw new Error('Folder kopii musi pozostać w folderze danych.');
  return resolved;
}
export async function verifiedBackup(db: DatabaseSync, dataDir: string, kind: string): Promise<string> {
  if(!/^[a-z0-9-]{1,80}$/.test(kind))throw new Error('Niepoprawny rodzaj kopii.');
  const dir = safeSubdir(dataDir,'backups');
  const filename=`${kind}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.sqlite`;
  const target=path.join(dir,filename), temp=target+'.tmp';
  const sourcePath=String(db.prepare('PRAGMA database_list').all().find(row=>row.name==='main')?.file??'');
  // A separate read connection avoids using the writing connection concurrently
  // with node:sqlite's asynchronous backup steps. WAL is included by SQLite.
  const source=sourcePath?new DatabaseSync(sourcePath,{readOnly:true}):db;
  try {
    await backup(source,temp);chmodSync(temp,0o600);
    const copy=new DatabaseSync(temp,{readOnly:true});
    try{if(copy.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('Kontrola kopii nie powiodła się.');}finally{copy.close();}
    renameSync(temp,target);return filename;
  }catch(error){if(existsSync(temp))rmSync(temp);throw error;}
  finally{if(source!==db)source.close();}
}
