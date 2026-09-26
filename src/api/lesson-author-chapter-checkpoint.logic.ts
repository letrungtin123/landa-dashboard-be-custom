export interface ChapterCheckpointStatus {
  draft_id:string;
  attempt_id:string|null;
  correlation_id:string|null;
  status:'open'|'running'|'timed_out'|'outcome_unknown'|'ready'|'failed'|'canceled';
  proposal_job_id:string|null;
  interruption:null|{
    completed_units:number;total_units:number;can_continue:true;previous_attempt_id:string;usage_pending_reconciliation:boolean;
  };
}
const uuid=(v:unknown)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
export function readChapterCheckpointStatus(value:unknown):ChapterCheckpointStatus|null {
  if(value===null) return null;
  const fail=():never=>{throw new Error('CHAPTER_CHECKPOINT_STATUS_INVALID');};
  if(!record(value)||!uuid(value.draft_id)||!(value.attempt_id===null||uuid(value.attempt_id))
    ||!(value.correlation_id===null||uuid(value.correlation_id))||!(value.proposal_job_id===null||uuid(value.proposal_job_id))
    ||!['open','running','timed_out','outcome_unknown','ready','failed','canceled'].includes(String(value.status))) return fail();
  if(value.status==='ready' && !uuid(value.proposal_job_id)) return fail();
  if(value.status!=='ready' && value.proposal_job_id!==null) return fail();
  if(value.interruption!==null){
    const i=value.interruption;
    if(!record(i)||!['timed_out','outcome_unknown'].includes(String(value.status))||i.can_continue!==true
      ||!Number.isSafeInteger(i.total_units)||Number(i.total_units)<1||Number(i.total_units)>512
      ||!Number.isSafeInteger(i.completed_units)||Number(i.completed_units)<0||Number(i.completed_units)>Number(i.total_units)
      ||!uuid(i.previous_attempt_id)||i.previous_attempt_id!==value.attempt_id||typeof i.usage_pending_reconciliation!=='boolean')return fail();
  }
  return value as unknown as ChapterCheckpointStatus;
}
export function chapterInterruptionVisible(status:ChapterCheckpointStatus|null,streaming:boolean):boolean {
  return !streaming && !!status?.interruption && ['timed_out','outcome_unknown'].includes(status.status);
}
export function chapterResumeRequest(status:ChapterCheckpointStatus) {
  if(!chapterInterruptionVisible(status,false)) throw new Error('CHAPTER_CHECKPOINT_RESUME_NOT_ALLOWED');
  return {draft_id:status.draft_id,previous_attempt_id:status.interruption!.previous_attempt_id};
}
