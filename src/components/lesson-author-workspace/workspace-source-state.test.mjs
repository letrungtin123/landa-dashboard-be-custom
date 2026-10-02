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
const {createWorkspaceCreateClient,WorkspaceCreateError}=load('../../api/workspace-create.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
  const scope={actorId:id(1),tenantId:id(2),courseId:'course-v1:TEST+SOURCE+2026'};
  const settings={active_bot:{target:'lesson_author',tenant_id:id(2),bot_id:id(3),ai_active_engine:'self_built_rag'},
    active_kb:{target:'lesson_author',tenant_id:id(2),kb_id:id(4)},active_persona:{target:'lesson_author',tenant_id:id(2),bot_id:id(3),persona_id:id(5)}};
  const conv={id:id(6),user_id:id(1),tenant_id:id(2),course_id:scope.courseId,target:'lesson_author',bot_id:id(3)};
  const docs=[{document_id:id(7),kb_id:id(4),name:'Synthetic.pdf',status:'learned'}];
  const state={authorized:true,visible:true,unknown:false,creates:0,conversations:0,uploads:0,video:0,documentReads:0};
  const results=[],requests=[];
  const streams=[];
  const api={settings:async()=>settings,documents:async()=>{state.documentReads++;return docs;},conversations:async()=>[conv],createConversation:async()=>{state.conversations++;return conv;},
    upload:async()=>{state.uploads++;return{results:[{success:true,data:{id:id(12),kb_id:id(4),name:'Uploaded.pdf',status:'learning',source_info:{extension:'pdf'}}}]};},
    video:async()=>{state.video++;return{job:{id:id(8),conversation_id:id(6),status:'queued',kb_document_id:null}};},
    transcript:async()=>{throw Error('unexpected');},commitTranscript:async()=>{throw Error('unexpected');}};
  const controller=createWorkspaceSourceState(scope,{api,authorized:()=>state.authorized,visible:()=>state.visible,canUpload:()=>true,
    operationId:()=>id(9),locale:'vi',onCreated:r=>results.push(r),stream:(scope,deps)=>{const item={scope,deps,started:0,closed:0};streams.push(item);return{start(){item.started++;},close(){item.closed++;}};},create:async(...args)=>{state.creates++;requests.push(args);
      if(state.unknown)throw new WorkspaceCreateError('unknown','UNCONFIRMED');
      return{workspace_id:id(10),conversation_id:id(6),course_id:scope.courseId,content_locale:args[1].content_locale,correlation_id:id(11)};}});
  return{scope,controller,state,settings,docs,results,requests,streams};
}
test('source reads never generate and Create uses only learned source + global ENVI locale',async()=>{
  const f=fixture();await f.controller.refresh();assert.equal(f.state.creates,0);assert.equal(f.controller.getState().ready,true);
  f.controller.select(id(7));f.controller.setUiLocale('en');await f.controller.create();
  assert.equal(f.state.creates,1);assert.equal(f.state.conversations,0);assert.equal(f.results.length,1);
  assert.deepEqual(f.requests[0],[id(6),{operation_id:id(9),source_document_ids:[id(7)],content_locale:'en'},'en']);
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
  const req={operation_id:id(9),source_document_ids:[id(7)],content_locale:'en'};
  await create(id(6),req,'vi');assert.equal(calls.length,1);assert.equal(calls[0][2]._retried,true);assert.equal(calls[0][2].signal,undefined);
  await assert.rejects(create(id(6),{...req,content_locale:'vi'},'vi'),{outcome:'unknown'});assert.equal(calls.length,2);
  await assert.rejects(create(id(6),{...req,tenant_id:id(99)},'vi'),{outcome:'rejected'});assert.equal(calls.length,2);
});
