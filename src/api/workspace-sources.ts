import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { fetchLessonAuthorChatSettings, fetchConversations, fetchLessonAuthorSourceDocuments,
  uploadLessonAuthorVideoTranscript, fetchLessonAuthorVideoTranscript, commitLessonAuthorVideoTranscript,
  type ChatConversation } from './custom-chat';
import type { UploadResult } from './custom-ai-chatbot';

/** AI course design source upload. Needs only the course edit permission: the
 * server resolves the tenant's AI course design knowledge base itself, so this
 * never touches the chatbot configuration (knowledge base management) routes. */
export async function uploadLessonAuthorSourceDocument(file: File, options?: {
  onProgress?: (percent: number | null) => void;
  signal?: AbortSignal;
}): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await customApiClient.post<{ success: boolean; data: UploadResult }>(
    '/api/ai-chatbot/chat/lesson-author/source-documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000, signal: options?.signal,
      onUploadProgress: (event: { loaded: number; total?: number }) => {
        options?.onProgress?.(event.total ? Math.min(100, Math.round(event.loaded * 100 / event.total)) : null);
      },
    });
  return data.data;
}

/** Reuse the established upload/transcription APIs, not a parallel ingest
 * pipeline. Conversation creation uses the same endpoint/body but suppresses
 * automatic POST auth replay (the legacy helper has no request options). */
export const workspaceSourceApi = {
  settings: fetchLessonAuthorChatSettings,
  conversations: (courseId: string) => fetchConversations({ target: 'lesson_author', courseId }),
  documents: () => fetchLessonAuthorSourceDocuments({ limit: 50 }),
  createConversation: async (courseId: string, personaId: string): Promise<ChatConversation> => {
    const config: AxiosRequestConfig & { _retried: boolean } = { params: { target: 'lesson_author' }, _retried: true };
    const { data } = await customApiClient.post('/api/ai-chatbot/chat/conversations',
      { persona_id: personaId, courseId, target: 'lesson_author' }, config);
    if (data?.success !== true) throw new Error('CONVERSATION_UNCONFIRMED');
    return data.data;
  },
  upload: uploadLessonAuthorSourceDocument,
  video: uploadLessonAuthorVideoTranscript,
  transcript: fetchLessonAuthorVideoTranscript,
  commitTranscript: commitLessonAuthorVideoTranscript,
};
