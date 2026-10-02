import type { AxiosRequestConfig } from 'axios';
import { customApiClient } from './custom-client';
import { fetchLessonAuthorChatSettings, fetchConversations, fetchLessonAuthorSourceDocuments,
  uploadLessonAuthorVideoTranscript, fetchLessonAuthorVideoTranscript, commitLessonAuthorVideoTranscript,
  type ChatConversation } from './custom-chat';
import { uploadDocuments } from './custom-ai-chatbot';

/** Reuse the established KB/upload/transcription APIs, not a parallel ingest
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
  upload: uploadDocuments,
  video: uploadLessonAuthorVideoTranscript,
  transcript: fetchLessonAuthorVideoTranscript,
  commitTranscript: commitLessonAuthorVideoTranscript,
};
