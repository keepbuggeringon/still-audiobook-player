import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuietDetector, emptyMaps, skipTarget, diagnosticSource } from '../src/analysis';

function feed(detector: QuietDetector, segments: {seconds:number; value:number}[], chunk = 1024, stereo = false) {
  const rate=8000, pcm=new Float32Array(Math.round(segments.reduce((n,s)=>n+s.seconds,0)*rate));
  let offset=0; for(const s of segments){const n=Math.round(s.seconds*rate);pcm.fill(s.value,offset,offset+n);offset+=n;}
  for(let i=0;i<pcm.length;i+=chunk){ const c=pcm.slice(i,i+chunk); detector.push(stereo?[c,c.map(v=>-v)]:[c],rate,i/rate); }
  detector.flush(); return detector.maps;
}
test('retains speech and short pauses; detects long quiet spans across buffer boundaries',()=>{
  const m=feed(new QuietDetector(),[{seconds:1,value:.1},{seconds:2,value:0},{seconds:1,value:.1},{seconds:.4,value:0},{seconds:1,value:.1}]);
  assert.equal(m.conservative.length,1); assert.ok(Math.abs(m.conservative[0][0]-1)<.021); assert.ok(Math.abs(m.conservative[0][1]-3)<.021);
});
test('opposite stereo channels cannot cancel into silence',()=>{
  assert.deepEqual(feed(new QuietDetector(),[{seconds:3,value:.1}],333,true).conservative,[]);
});
test('whisper-like low volume is preserved by conservative setting',()=>{
  const m=feed(new QuietDetector(),[{seconds:3,value:.008}]); // about -42 dBFS
  assert.equal(m.conservative.length,0);assert.equal(m.balanced.length,0);assert.equal(m.strong.length,1);
});
test('skip boundaries retain padding and off disables all skips',()=>{
  const m=emptyMaps(); m.conservative=[[2,5],[10,13]];
  assert.equal(skipTarget(m,'conservative',2.1),null);assert.equal(skipTarget(m,'conservative',2.4),4.7);
  assert.equal(skipTarget(m,'conservative',4.7),null);assert.equal(skipTarget(m,'conservative',6),null);
  assert.equal(skipTarget(m,'conservative',10.5),12.7);assert.equal(skipTarget(m,'off',10.5),null);
});
test('checkpoint cannot advance past an unfinished quiet span',()=>{
  const d=new QuietDetector();d.push([new Float32Array(16000)],8000,0);assert.equal(d.checkpointTime(),0);
  d.push([new Float32Array(8000).fill(.1)],8000,2);assert.ok(d.checkpointTime()>2.9);
});
test('discontinuous PCM does not classify missing audio as quiet',()=>{
  const d=new QuietDetector(); d.push([new Float32Array(4000)],8000,0);d.push([new Float32Array(4000)],8000,10);d.flush();assert.equal(d.maps.conservative.length,0);
});
test('diagnostic WAV is bounded and its known pauses match source PCM',async()=>{
  const d=diagnosticSource();assert.ok(d.blob.size<2e6);assert.equal(d.maps.conservative.length,12);
  const bytes=await d.blob.arrayBuffer(), v=new DataView(bytes);assert.equal(v.getUint32(24,true),8000);
  assert.equal(v.getInt16(44+5*8000*2,true),0);assert.notEqual(v.getInt16(44+(8000+1)*2,true),0);
});
