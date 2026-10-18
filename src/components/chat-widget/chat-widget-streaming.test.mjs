import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const widget = readFileSync(new URL('./chat-widget.tsx', import.meta.url), 'utf8');

test('finished messages are memoized so a streamed chunk redraws only the streaming message', () => {
  assert.match(widget, /^const MessageBubble = memo\(MessageBubbleView\);$/m);
  assert.match(widget, /^function MessageBubbleView\(/m);
  assert.doesNotMatch(widget, /^function MessageBubble\(/m);
  // Every handler the list passes to a bubble is a stable useCallback.
  for (const name of ['handleMentionClick', 'handleSourceDocumentClick', 'handleCommitLessonAuthorTranscript',
    'handleDownloadLessonAuthorTranscript', 'handleDraftCourseFromTranscript', 'handleApplyReportFilter',
    'handleStartReportPdfExport', 'handleDownloadReportPdf']) {
    assert.match(widget, new RegExp(`const ${name} = useCallback\\(`), name);
  }
});

test('the chunk handler scrolls at most once per frame, not once per chunk', () => {
  const chunk = widget.slice(widget.indexOf('streamAccumulator.value += text;'), widget.indexOf('() => { void finishStream(streamAccumulator.value); }'));
  assert.match(chunk, /if \(streamScrollFrameRef\.current === null\)/);
  assert.match(chunk, /window\.requestAnimationFrame\(/);
  assert.doesNotMatch(chunk, /setTimeout\(/);
  assert.match(widget, /window\.cancelAnimationFrame\(streamScrollFrameRef\.current\)/);
});
