import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('./lesson-author-chapter-checkpoint.logic.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readChapterCheckpointStatus,chapterInterruptionVisible,chapterResumeRequest}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const id='11111111-1111-4111-8111-111111111111';
const status={draft_id:id,attempt_id:id,correlation_id:id,status:'timed_out',proposal_job_id:null,
  interruption:{completed_units:3,total_units:5,can_continue:true,previous_attempt_id:id,usage_pending_reconciliation:true}};
test('timeout card uses server counts; explicit Continue sends only exact IDs',()=>{
  const value=readChapterCheckpointStatus(status);
  assert.equal(chapterInterruptionVisible(value,false),true);
  assert.deepEqual(chapterResumeRequest(value),{draft_id:id,previous_attempt_id:id});
});
test('initial / continuation loading remains free of unit counters',()=>{
  assert.equal(chapterInterruptionVisible(status,true),false);
  for(const state of ['running','open','ready','failed','canceled']){
    const s={...status,status:state,proposal_job_id:state==='ready'?id:null,interruption:null};
    assert.equal(chapterInterruptionVisible(readChapterCheckpointStatus(s),false),false);
    assert.throws(()=>chapterResumeRequest(s));
  }
});
test('rejects forged progress, impossible counts, missing/unknown IDs and interruption on running',()=>{
  for(const bad of [{}, {...status,draft_id:'bad'}, {...status,status:'running'}, {...status,status:'ready'},
    {...status,interruption:{...status.interruption,completed_units:6}},
    {...status,interruption:{...status.interruption,total_units:513}},
    {...status,interruption:{...status.interruption,previous_attempt_id:'other'}},
    {...status,interruption:{...status.interruption,can_continue:false}}])assert.throws(()=>readChapterCheckpointStatus(bad));
});
test('expired non-resumable interrupted status hides card; empty server history stays empty',()=>{
  assert.equal(readChapterCheckpointStatus(null),null);
  assert.equal(chapterInterruptionVisible(readChapterCheckpointStatus({...status,interruption:null}),false),false);
  assert.equal(chapterInterruptionVisible(readChapterCheckpointStatus({...status,status:'outcome_unknown'}),false),true);
});
test('UI wiring retains four-step definition and uses GET recovery only, EN/VI and same send/loading path',()=>{
  const widget=readFileSync(new URL('../components/chat-widget/chat-widget.tsx',import.meta.url),'utf8');
  const api=readFileSync(new URL('./custom-chat.ts',import.meta.url),'utf8');
  const definition=widget.slice(widget.indexOf('const progressSteps = ['),widget.indexOf('const progressSteps = [')+5000);
  const array=definition.slice(0,definition.indexOf('];')+2);
  assert.equal((array.match(/key:/g)||[]).length,4);
  assert.doesNotMatch(array,/chapterCheckpoint|completed_units|total_units/);
  assert.match(widget,/chapterInterruptionVisible\(chapterCheckpoint \?\? null,streaming\)/);
  assert.match(widget,/currentConvIdRef.current!==conversationId/);
  assert.match(widget,/Tiếp tục hoàn thành chương/);assert.match(widget,/Continue completing the chapter/);
  const get=api.slice(api.indexOf('export async function fetchChapterCheckpointStatus'),api.indexOf('function blueprintJobStorageKey'));
  assert.match(get,/customApiClient.get/);assert.doesNotMatch(get,/\.post|sendMessageStream/);
  assert.match(api,/headers\['X-Lesson-Author-Chapter-Key'\] = crypto.randomUUID\(\)/);
  assert.match(widget,/activeStreamConversationIdsRef.current.has\(currentConv.id\)/);
});
