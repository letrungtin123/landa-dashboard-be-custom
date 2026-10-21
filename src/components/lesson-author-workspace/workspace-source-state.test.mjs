/* global URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function load(path){
  const url=new URL(path,import.meta.url);if(modules.has(url.href))return modules.get(url.href);
  const module={exports:{}};
  const output=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const require=name=>name.endsWith('custom-client')?{customApiClient:{}}:name.endsWith('workspace-source-stream')?{createWorkspaceSourceStreamClient(){throw Error('test must inject stream');}}:load(new URL(`${name}.ts`,url).href);
  new Function('require','module','exports',output)(require,module,module.exports);modules.set(url.href,module.exports);return module.exports;
}
const {createWorkspaceSourceState}=load('./workspace-source-state.ts');
const {SOURCE_DELETE_SETTLE_DELAYS_MS,workspaceSourceDeleteIssue}=load('./workspace-source.logic.ts');
const {createWorkspaceCreateClient,WorkspaceCreateError}=load('../../api/workspace-create.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
  const scope={actorId:id(1),tenantId:id(2),courseId:'course-v1:TEST+SOURCE+2026'};
  const settings={active_bot:{target:'lesson_author',tenant_id:id(2),bot_id:id(3),ai_active_engine:'self_built_rag'},
    active_kb:{target:'lesson_author',tenant_id:id(2),kb_id:id(4)},active_persona:{target:'lesson_author',tenant_id:id(2),bot_id:id(3),persona_id:id(5)}};
  const conv={id:id(6),user_id:id(1),tenant_id:id(2),course_id:scope.courseId,target:'lesson_author',bot_id:id(3)};
  const conversations=[conv];
  const docs=[{document_id:id(7),kb_id:id(4),name:'Synthetic.pdf',status:'learned'}];
  const state={authorized:true,visible:true,unknown:false,creates:0,conversations:0,uploads:0,video:0,documentReads:0,settingsReads:0,waits:0,canDelete:false,deletes:[]};
  const results=[],requests=[];
  const streams=[];
  const api={settings:async()=>{state.settingsReads++;return settings;},documents:async()=>{state.documentReads++;return docs;},conversations:async()=>conversations,createConversation:async()=>{state.conversations++;return conv;},
    upload:async()=>{state.uploads++;return{results:[{success:true,data:{id:id(12),kb_id:id(4),name:'Uploaded.pdf',status:'learning',source_info:{extension:'pdf'}}}]};},
    video:async()=>{state.video++;return{job:{id:id(8),conversation_id:id(6),status:'queued',kb_document_id:null}};},
    transcript:async()=>{throw Error('unexpected');},commitTranscript:async()=>{throw Error('unexpected');},
    deleteDocument:async(kbId,docId)=>{state.deletes.push(['one',kbId,docId]);},bulkDeleteDocuments:async(kbId,ids)=>{state.deletes.push(['bulk',kbId,ids]);return{deleted:ids.length};}};
  const controller=createWorkspaceSourceState(scope,{api,authorized:()=>state.authorized,visible:()=>state.visible,canUpload:()=>true,canDelete:()=>state.canDelete,
    operationId:()=>id(9),locale:'vi',wait:async()=>{state.waits++;},onCreated:r=>results.push(r),stream:(scope,deps)=>{const item={scope,deps,started:0,closed:0};streams.push(item);return{start(){item.started++;},close(){item.closed++;}};},create:async(...args)=>{state.creates++;requests.push(args);
      if(state.unknown)throw new WorkspaceCreateError('unknown','UNCONFIRMED');
      return{workspace_id:id(10),conversation_id:id(6),course_id:scope.courseId,content_locale:args[1].content_locale,correlation_id:id(11)};}});
  // A complete design brief, so Create is gated only by what each test changes.
  controller.setBrief({learner_audience:' Nhân viên mới ',course_purpose:'Hiểu quy trình bán hàng'});
  return{scope,controller,state,settings,docs,conversations,results,requests,streams,api};
}
test('source reads never generate and Create uses only learned source + global ENVI locale',async()=>{
  const f=fixture();await f.controller.refresh();assert.equal(f.state.creates,0);assert.equal(f.controller.getState().ready,true);
  f.controller.select(id(7));f.controller.setUiLocale('en');await f.controller.create();
  assert.equal(f.state.creates,1);assert.equal(f.state.conversations,0);assert.equal(f.results.length,1);
  assert.deepEqual(f.requests[0],[id(6),{operation_id:id(9),source_document_ids:[id(7)],content_locale:'en',design_mode:'instructional_design',
    learner_audience:'Nhân viên mới',course_purpose:'Hiểu quy trình bán hàng'},'en']);
});
test('session choice is exact: new creates once and missing resume never falls back to another draft',async()=>{
  const fresh=fixture();await fresh.controller.refresh();fresh.controller.beginNewSession();fresh.controller.select(id(7));await fresh.controller.create();
  assert.equal(fresh.state.conversations,1);assert.equal(fresh.state.creates,1);
  const missing=fixture();await missing.controller.refresh();missing.controller.resumeSession(id(44));await missing.controller.refresh();
  assert.equal(missing.controller.getState().issue,'unavailable');assert.equal(missing.controller.getState().conversation,null);
  missing.controller.select(id(7));await missing.controller.create();assert.equal(missing.state.creates,0);assert.equal(missing.state.conversations,0);
});
test('not-ready source and changed assignment cannot dispatch generation',async()=>{
  const f=fixture();await f.controller.refresh();f.controller.select(id(7));f.docs[0].status='learning';await f.controller.create();
  assert.equal(f.state.creates,0);assert.equal(f.controller.getState().issue,'source_not_ready');
  f.settings.active_kb.kb_id=id(40);await f.controller.create();assert.equal(f.state.creates,0);
});
test('unknown Create outcome remains latched through refresh and repeated actions: no automatic paid retry',async()=>{
  const f=fixture();await f.controller.refresh();f.controller.select(id(7));f.state.unknown=true;await f.controller.create();
  assert.equal(f.controller.getState().unknown,true);await f.controller.refresh();await f.controller.create();
  await f.controller.upload({name:'test.mp4',size:100});assert.equal(f.state.creates,1);assert.equal(f.state.video,0);
});
test('revoked scope, hidden view and disposal do not dispatch new operations',async()=>{
  for(const key of ['authorized','visible']){const f=fixture();await f.controller.refresh();f.controller.select(id(7));f.state[key]=false;
    await f.controller.create();assert.equal(f.state.creates,0);}
  const f=fixture();f.controller.dispose();await f.controller.refresh();await f.controller.create();assert.equal(f.state.creates,0);assert.equal(f.controller.getState().documents.length,0);
});
test('document upload reuses KB upload while MP4 stays transcript-only until explicit commit',async()=>{
  const f=fixture();await f.controller.refresh();await f.controller.upload({name:'test.pdf',size:100});
  assert.equal(f.state.uploads,1);assert.equal(f.state.creates,0);assert.equal(f.controller.getState().selectedId,id(12));
  assert.equal(f.controller.getState().documents[0].name,'Uploaded.pdf');assert.equal(f.streams[0].started,1);
  await f.controller.upload({name:'test.mp4',size:100});assert.equal(f.state.video,1);assert.equal(f.state.uploads,1);
  assert.equal(f.controller.getState().transcript.status,'queued');assert.equal(f.state.creates,0);
});
test('uploaded source renders immediately and exact push marks it ready without list polling or Create',async()=>{
  const f=fixture();await f.controller.refresh();const reads=f.state.documentReads;await f.controller.upload({name:'test.pdf',size:100});
  assert.equal(f.state.uploads,1);assert.equal(f.state.creates,0);assert.equal(f.controller.getState().sourceObservation,'connecting');
  assert.equal(f.state.documentReads,reads+1,'upload preflight may refresh once; readiness never loops the list');
  f.streams[0].deps.onState('live');
  f.streams[0].deps.onDocument({document_id:id(12),kb_id:id(4),name:'Uploaded.pdf',type:'file',status:'learned',updated_at:new Date().toISOString()});
  assert.equal(f.controller.getState().sourceObservation,'idle');assert.equal(f.controller.getState().documents[0].status,'learned');
  assert.equal(f.state.uploads,1);assert.equal(f.state.creates,0);
});
test('source stream closes when the panel hides and cannot dispatch Create',async()=>{
  const f=fixture();await f.controller.refresh();await f.controller.upload({name:'test.pdf',size:100});
  f.controller.setVisible(false);
  assert.equal(f.streams[0].closed,1);assert.equal(f.controller.getState().sourceObservation,'idle');assert.equal(f.state.creates,0);
});
test('terminal source error remains visible and never becomes source-ready',async()=>{
  const f=fixture();await f.controller.refresh();await f.controller.upload({name:'test.pdf',size:100});
  f.streams[0].deps.onDocument({document_id:id(12),kb_id:id(4),name:'Uploaded.pdf',type:'file',status:'error',updated_at:new Date().toISOString()});
  assert.equal(f.controller.getState().documents[0].status,'error');assert.equal(f.controller.getState().issue,'source_failed');
  await f.controller.create();assert.equal(f.state.creates,0);
});
test('create transport is one POST, disables auth replay and treats invalid readback as unknown',async()=>{
  const f=fixture(),calls=[];const create=createWorkspaceCreateClient(f.scope,{post:async(...args)=>{calls.push(args);return{data:{success:true,data:{
    workspace_id:id(10),conversation_id:id(6),correlation_id:id(11),content_locale:'en',status:'designing'}}};}});
  const req={operation_id:id(9),source_document_ids:[id(7)],content_locale:'en',design_mode:'preserve_source'};
  await create(id(6),req,'vi');assert.equal(calls.length,1);assert.equal(calls[0][2]._retried,true);assert.equal(calls[0][2].signal,undefined);
  await assert.rejects(create(id(6),{...req,content_locale:'vi'},'vi'),{outcome:'unknown'});assert.equal(calls.length,2);
  await assert.rejects(create(id(6),{...req,tenant_id:id(99)},'vi'),{outcome:'rejected'});assert.equal(calls.length,2);
});
const networkError=()=>Object.assign(Error('Network Error'),{code:'ERR_NETWORK',request:{}});
const statusError=status=>Object.assign(Error(`status ${status}`),{response:{status,data:{}}});
test('a short server restart is retried automatically and the panel recovers without a page reload',async()=>{
  const f=fixture();let failures=2;const settings=f.api.settings;
  f.api.settings=async()=>{if(failures-->0){f.state.settingsReads++;throw networkError();}return settings();};
  await f.controller.refresh();
  assert.equal(f.state.settingsReads,3);assert.equal(f.state.waits,2);
  assert.equal(f.controller.getState().issue,null);assert.equal(f.controller.getState().ready,true);assert.equal(f.state.creates,0);
});
test('gateway errors are retried, a lasting outage shows the connection message, and real refusals are not retried',async()=>{
  const busy=fixture();let calls=0;busy.api.documents=async()=>{calls++;throw statusError(503);};
  await busy.controller.refresh();
  assert.equal(calls,5);assert.equal(busy.controller.getState().issue,'connection');assert.equal(busy.controller.getState().ready,false);
  assert.equal(busy.controller.getState().unknown,false,'a failed read never latches the unknown state');
  busy.api.documents=async()=>busy.docs;await busy.controller.refresh();
  assert.equal(busy.controller.getState().issue,null);assert.equal(busy.controller.getState().ready,true);
  const denied=fixture();let reads=0;denied.api.settings=async()=>{reads++;throw statusError(403);};
  await denied.controller.refresh();assert.equal(reads,1);assert.equal(denied.state.waits,0);assert.equal(denied.controller.getState().issue,'unavailable');
  const broken=fixture();let parses=0;broken.api.conversations=async()=>{parses++;throw Error('UNAVAILABLE');};
  await broken.controller.refresh();assert.equal(parses,1);assert.equal(broken.controller.getState().issue,'unavailable');
});
test('a create preflight that loses the server never dispatches Create and can be retried',async()=>{
  const f=fixture();await f.controller.refresh();f.controller.select(id(7));
  const settings=f.api.settings;f.api.settings=async()=>{throw networkError();};
  await f.controller.create();
  assert.equal(f.state.creates,0);assert.equal(f.controller.getState().issue,'connection');assert.equal(f.controller.getState().unknown,false);
  f.api.settings=settings;await f.controller.refresh();await f.controller.create();
  assert.equal(f.state.creates,1);
});
test('Try again after live status was lost reopens it for a learning document, and clears it once the list says ready',async()=>{
  const f=fixture();await f.controller.refresh();await f.controller.upload({name:'test.pdf',size:100});
  f.streams[0].deps.onState('unavailable');
  assert.equal(f.controller.getState().sourceObservation,'unavailable');
  f.docs.unshift({document_id:id(12),kb_id:id(4),name:'Uploaded.pdf',status:'learning'});
  await f.controller.refresh();
  assert.equal(f.streams.length,2,'a fresh exact-document stream replaces the stopped one');assert.equal(f.streams[1].started,1);
  assert.equal(f.streams[1].scope.documentId,id(12));assert.equal(f.controller.getState().sourceObservation,'connecting');
  f.streams[1].deps.onState('unavailable');
  f.docs[0]={...f.docs[0],status:'learned'};
  await f.controller.refresh();
  assert.equal(f.streams.length,2,'a finished document needs no stream');
  assert.equal(f.controller.getState().sourceObservation,'idle');assert.equal(f.controller.getState().documents[0].status,'learned');
  assert.equal(f.controller.getState().issue,null);assert.equal(f.state.creates,0);assert.equal(f.state.uploads,1);
});
test('late stream noise after the ready push cannot repaint the source as connecting',async()=>{
  const f=fixture();await f.controller.refresh();await f.controller.upload({name:'test.pdf',size:100});
  f.streams[0].deps.onDocument({document_id:id(12),kb_id:id(4),name:'Uploaded.pdf',type:'file',status:'learned',updated_at:new Date().toISOString()});
  f.streams[0].deps.onState('reconnecting');f.streams[0].deps.onState('unavailable');
  assert.equal(f.controller.getState().sourceObservation,'idle');assert.equal(f.controller.getState().issue,null);
});
test('source panel copy has a plain Try again action and no technical words',()=>{
  const panel=readFileSync(new URL('./workspace-source-panel.tsx',import.meta.url),'utf8');
  const copy=panel.slice(panel.indexOf('const copy = {'),panel.indexOf('} as const;'));
  for(const word of [/\bbot\b/i,/persona/i,/lập chỉ mục/i,/\bindex/i,/\bmodal\b/i,/\bKB\b/,/\b[45]\d\d\b/,/workspace/i,/\bsource access\b/i])assert.doesNotMatch(copy,word);
  assert.match(copy,/refresh: 'Thử lại'/);assert.match(copy,/refresh: 'Try again'/);
  assert.match(copy,/connection: 'Tạm thời chưa kết nối được máy chủ/);
  assert.match(panel,/state\.issue === 'connection'/);
});

// ── Delete documents from the knowledge base (QC 21/10, C4 / contract K5) ──
const doc=(n,status='learned')=>({document_id:id(n),kb_id:id(4),name:`Doc-${n}.pdf`,status});
const refusal=(status,code)=>Object.assign(Error(String(status)),{response:{status,data:code?{code,message:'Thông báo máy chủ'}:{}}});
const removeFrom=(docs,ids)=>{for(const docId of ids){const at=docs.findIndex(d=>d.document_id===docId);if(at>=0)docs.splice(at,1);}};
test('delete: without the knowledge base delete permission there are no controls and nothing is sent',async()=>{
  const f=fixture();await f.controller.refresh();
  assert.equal(f.controller.getState().canDelete,false);
  assert.deepEqual(await f.controller.deleteDocuments([id(7)]),{issue:'forbidden',kept:0});
  assert.deepEqual(f.state.deletes,[]);
});
test('delete one: the knowledge base delete route, one list re-read, the deleted source unselected, never Create',async()=>{
  const f=fixture();f.state.canDelete=true;f.docs.push(doc(20));
  await f.controller.refresh();assert.equal(f.controller.getState().canDelete,true);
  f.controller.select(id(7));
  f.api.deleteDocument=async(kbId,docId)=>{f.state.deletes.push(['one',kbId,docId]);removeFrom(f.docs,[docId]);};
  const reads=f.state.documentReads;
  assert.deepEqual(await f.controller.deleteDocuments([id(7)]),{issue:null,kept:0});
  assert.deepEqual(f.state.deletes,[['one',id(4),id(7)]],'the active AI ID knowledge base, exact document');
  assert.equal(f.state.documentReads,reads+1,'the list had already settled');
  const s=f.controller.getState();
  assert.deepEqual(s.documents.map(d=>d.document_id),[id(20)]);
  assert.deepEqual([s.selectedId,s.busy,s.phase,s.ready,s.issue],[null,false,'idle',true,null]);
  await f.controller.create();
  assert.equal(f.state.creates,0,'no source is chosen any more');assert.equal(f.controller.getState().issue,'source_not_ready');
});
test('delete several: one bulk request; another selected document and the brief stay; documents being read are never sent',async()=>{
  const f=fixture();f.state.canDelete=true;f.docs.push(doc(20),doc(21),doc(22,'learning'));
  await f.controller.refresh();f.controller.select(id(7));f.controller.setBrief({course_purpose:'Mục đích mới'});
  f.api.bulkDeleteDocuments=async(kbId,ids)=>{f.state.deletes.push(['bulk',kbId,ids]);removeFrom(f.docs,ids);return{deleted:ids.length,queued:ids.length};};
  assert.deepEqual(await f.controller.deleteDocuments([id(20),id(21),id(22),id(20)]),{issue:null,kept:0});
  assert.deepEqual(f.state.deletes,[['bulk',id(4),[id(20),id(21)]]]);
  const s=f.controller.getState();
  assert.equal(s.selectedId,id(7));assert.equal(s.brief.course_purpose,'Mục đích mới');
  assert.deepEqual(s.documents.map(d=>d.document_id),[id(7),id(22)]);
  await f.controller.create();assert.equal(f.state.creates,1,'Create still works with the kept selection');
});
test('a queued delete is followed until the list no longer shows it, and the following is bounded',async()=>{
  const f=fixture();f.state.canDelete=true;f.docs.push(doc(20));await f.controller.refresh();
  let pending=2;const documents=f.api.documents;
  f.api.documents=async()=>{const list=await documents();return pending-->0?list:list.filter(d=>d.document_id!==id(20));};
  assert.deepEqual(await f.controller.deleteDocuments([id(20)]),{issue:null,kept:0});
  assert.equal(f.state.waits,2,'re-read twice while the queue finishes');
  assert.deepEqual(f.controller.getState().documents.map(d=>d.document_id),[id(7)]);
  const stuck=fixture();stuck.state.canDelete=true;stuck.docs.push(doc(20));await stuck.controller.refresh();
  assert.deepEqual(await stuck.controller.deleteDocuments([id(20)]),{issue:null,kept:1},'a document that stays is reported, not followed forever');
  assert.equal(stuck.state.waits,SOURCE_DELETE_SETTLE_DELAYS_MS.length);
  assert.equal(stuck.controller.getState().busy,false);
});
test('a bulk delete the server partly skipped reports how many documents stay, without waiting for them',async()=>{
  const f=fixture();f.state.canDelete=true;f.docs.push(doc(20),doc(21));await f.controller.refresh();
  f.api.bulkDeleteDocuments=async(_kbId,ids)=>{removeFrom(f.docs,[ids[0]]);return{deleted:1,queued:1};};
  assert.deepEqual(await f.controller.deleteDocuments([id(20),id(21)]),{issue:null,kept:1});
  assert.equal(f.state.waits,0);
  assert.deepEqual(f.controller.getState().documents.map(d=>d.document_id),[id(7),id(21)]);
});
test('a document AI is using is not deleted: a plain refusal, the selection and the list stay, nothing is followed',async()=>{
  const f=fixture();f.state.canDelete=true;f.docs.push(doc(20));await f.controller.refresh();f.controller.select(id(20));
  f.api.deleteDocument=async()=>{throw refusal(409,'KB_DOCUMENT_IN_USE_BY_AI_ID');};
  assert.deepEqual(await f.controller.deleteDocuments([id(20)]),{issue:'in_use',kept:0});
  f.api.bulkDeleteDocuments=async()=>{throw refusal(409,'KB_DOCUMENT_IN_USE_BY_AI_ID');};
  assert.deepEqual(await f.controller.deleteDocuments([id(20),id(7)]),{issue:'in_use',kept:0},'a refused bulk request deletes nothing');
  const s=f.controller.getState();
  assert.deepEqual([s.selectedId,s.ready,s.issue,s.busy,f.state.waits],[id(20),true,null,false,0]);
  assert.deepEqual(s.documents.map(d=>d.document_id),[id(7),id(20)]);
  await f.controller.create();assert.equal(f.state.creates,1,'Create is not broken by a refused delete');
});
test('delete refusals map to plain categories; an already deleted document counts as deleted',async()=>{
  for(const [error,issue] of [[refusal(409,'KB_DOCUMENT_IN_USE_BY_AI_ID'),'in_use'],[refusal(409,'KB_DOCUMENT_LEARNING'),'learning'],
    [refusal(403,'PERMISSION_DENIED'),'forbidden'],[refusal(401),'forbidden'],[refusal(500),'failed'],[refusal(409),'failed'],
    [refusal(404),'gone'],[refusal(503),'connection'],[Object.assign(Error('Network Error'),{code:'ERR_NETWORK',request:{}}),'connection']]){
    assert.equal(workspaceSourceDeleteIssue(error),issue,JSON.stringify(error.response??error.code));
  }
  const f=fixture();f.state.canDelete=true;f.docs.push(doc(20));await f.controller.refresh();
  f.api.deleteDocument=async()=>{removeFrom(f.docs,[id(20)]);throw refusal(404);};
  assert.deepEqual(await f.controller.deleteDocuments([id(20)]),{issue:null,kept:0});
  const lost=fixture();lost.state.canDelete=true;lost.docs.push(doc(20));await lost.controller.refresh();
  lost.api.deleteDocument=async()=>{throw Object.assign(Error('Network Error'),{code:'ERR_NETWORK',request:{}});};
  const reads=lost.state.documentReads;
  assert.deepEqual(await lost.controller.deleteDocuments([id(20)]),{issue:'connection',kept:0});
  assert.equal(lost.state.documentReads,reads+1,'after a lost answer the list is read once to show the truth');
});
test('a hidden panel, a revoked permission, a locked panel or a closed session never sends a delete',async()=>{
  const f=fixture();f.state.canDelete=true;await f.controller.refresh();
  f.state.visible=false;assert.deepEqual(await f.controller.deleteDocuments([id(7)]),{issue:'forbidden',kept:0});f.state.visible=true;
  f.state.canDelete=false;assert.deepEqual(await f.controller.deleteDocuments([id(7)]),{issue:'forbidden',kept:0});f.state.canDelete=true;
  assert.deepEqual(await f.controller.deleteDocuments([id(99)]),{issue:null,kept:0},'an id outside the list is ignored');
  f.state.unknown=true;f.controller.select(id(7));await f.controller.create();
  assert.deepEqual(await f.controller.deleteDocuments([id(7)]),{issue:null,kept:0},'an unknown Create outcome locks the panel');
  const closed=fixture();closed.state.canDelete=true;await closed.controller.refresh();closed.controller.dispose();
  assert.deepEqual(await closed.controller.deleteDocuments([id(7)]),{issue:null,kept:0});
  assert.deepEqual([...f.state.deletes,...closed.state.deletes],[]);
});
