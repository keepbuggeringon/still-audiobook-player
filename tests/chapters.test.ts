import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBuffer } from 'music-metadata';
function atom(name: string, body: Buffer) { const head=Buffer.alloc(8); head.writeUInt32BE(body.length+8); head.write(name,4); return Buffer.concat([head,body]); }
test('M4B Nero chapter times retain their declared scale', async () => {
  const entries = [[0,'Opening'],[15,'Second chapter']] as const;
  const body = Buffer.concat([Buffer.from([1,0,0,0,0,0,0,0,entries.length]), ...entries.map(([t,name])=> { const b=Buffer.alloc(9); b.writeBigUInt64BE(BigInt(t*10000000)); b[8]=Buffer.byteLength(name); return Buffer.concat([b,Buffer.from(name)]); })]);
  const input=Buffer.concat([atom('ftyp',Buffer.from('M4B \0\0\0\0isom','binary')),atom('moov',atom('udta',atom('chpl',body)))]);
  const result=await parseBuffer(input,{mimeType:'audio/mp4'},{includeChapters:true,skipCovers:true});
  assert.deepEqual(result.format.chapters?.map(c=>({title:c.title,start:c.start/(c.timeScale??1)})),[{title:'Opening',start:0},{title:'Second chapter',start:15}]);
});
