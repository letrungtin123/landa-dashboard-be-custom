import type {
  LessonAuthorBlueprintChapter,
  LessonAuthorBlueprintMediaPlan,
  LessonAuthorBlueprintMediaReview,
  LessonAuthorMediaDecisionStatus,
} from '@/api/custom-chat';

interface MediaLocation {
  chapterIndex: number;
  lessonIndex: number;
  unitIndex: number;
  chapterTitle: string;
  lessonTitle: string;
  unitTitle: string;
}

export interface BlueprintMediaPlacement extends MediaLocation {
  media: LessonAuthorBlueprintMediaPlan;
  mediaStatus: LessonAuthorMediaDecisionStatus;
}

export interface BlueprintMediaDecisionPlacement extends MediaLocation {
  mediaStatus: LessonAuthorMediaDecisionStatus;
  reasonCode: string;
}

export type MediaReviewPresentationState = 'not_evaluated' | 'incomplete' | 'attention' | 'complete';

/** Presentation only: keep the original Blueprint and all audit decisions intact. */
export function buildBlueprintMediaPresentation(
  chapters: readonly LessonAuthorBlueprintChapter[],
  review?: LessonAuthorBlueprintMediaReview,
) {
  const proposals: BlueprintMediaPlacement[] = [];
  const decisions: BlueprintMediaDecisionPlacement[] = [];
  const byPath = new Map((review?.decisions ?? []).map(decision => [decision.unit_path, decision]));
  const unitPaths = new Set<string>();
  let incomplete = false;
  let attention = false;
  chapters.forEach((chapter, chapterIndex) => chapter.lessons.forEach((lesson, lessonIndex) => {
    (lesson.units ?? []).forEach((unit, unitIndex) => {
      const path = `chapter_${chapterIndex + 1}.lesson_${lessonIndex + 1}.unit_${unitIndex + 1}`;
      unitPaths.add(path);
      const decision = byPath.get(path);
      const location = {
        chapterIndex, lessonIndex, unitIndex,
        chapterTitle: chapter.title, lessonTitle: lesson.title, unitTitle: unit.title,
      };
      const status = decision?.status ?? 'NOT_EVALUATED';
      incomplete ||= status === 'NOT_EVALUATED';
      attention ||= status === 'FAILED' || status === 'SOURCE_GAP';
      if (unit.media_plan) {
        // Legacy plans remain visible without review metadata. An inconsistent
        // review never silently removes a real brief or marks it fully reviewed.
        proposals.push({ ...location, media: unit.media_plan, mediaStatus: status });
        attention ||= status === 'NOT_NEEDED';
      } else if (decision && status !== 'NOT_NEEDED') {
        const missingPlan = status === 'PROPOSED';
        attention ||= missingPlan;
        decisions.push({
          ...location,
          mediaStatus: missingPlan ? 'NOT_EVALUATED' : status,
          reasonCode: missingPlan ? 'MEDIA_PLAN_MISSING' : decision.reason_code,
        });
      }
    });
  }));
  attention ||= Boolean(review && (
    byPath.size !== review.decisions.length
    || review.decisions.some(decision => !unitPaths.has(decision.unit_path))
  ));
  const state: MediaReviewPresentationState = !review ? 'not_evaluated'
    : attention ? 'attention'
      : incomplete || unitPaths.size === 0 ? 'incomplete' : 'complete';
  return { proposals, decisions, state };
}

export function getBlueprintMediaReviewCopy(state: MediaReviewPresentationState, locale: 'vi' | 'en') {
  const vi = locale === 'vi';
  if (state === 'not_evaluated') return {
    notice: vi ? 'Bản thiết kế này chưa có đánh giá media; đề xuất cũ vẫn được giữ để review.'
      : 'This blueprint has no media evaluation; existing recommendations remain available for review.',
    emptyTitle: vi ? 'Chưa đánh giá đề xuất media' : 'Media recommendations have not been evaluated',
    emptyDescription: vi ? 'Chưa thể kết luận có cần video hoặc infographic hay không.'
      : 'It is not yet known whether video or infographic recommendations are needed.',
  };
  if (state === 'attention') return {
    notice: vi ? 'Một số đề xuất media cần kiểm tra do lỗi đánh giá, thiếu bằng chứng nguồn hoặc dữ liệu chưa nhất quán.'
      : 'Some media recommendations need review because of evaluation errors, missing source evidence or inconsistent data.',
    emptyTitle: vi ? 'Chưa thể kết luận đề xuất media' : 'Media recommendations need review',
    emptyDescription: vi ? 'Không được hiểu lỗi đánh giá hoặc dữ liệu thiếu là không cần media.'
      : 'Evaluation errors or missing data do not mean that media is unnecessary.',
  };
  if (state === 'incomplete') return {
    notice: vi ? 'Đánh giá media chưa đầy đủ cho tất cả bài học.'
      : 'Media evaluation is not complete for every unit.',
    emptyTitle: vi ? 'Chưa hoàn tất đánh giá media' : 'Media evaluation is incomplete',
    emptyDescription: vi ? 'Chưa thể kết luận không cần media khi còn bài học chưa được đánh giá.'
      : 'Unevaluated units cannot be treated as requiring no media.',
  };
  return {
    notice: vi ? 'Chỉ hiển thị các đề xuất video và infographic; các mục không cần media được ẩn.'
      : 'Only video and infographic recommendations are shown; units needing no media are hidden.',
    emptyTitle: vi ? 'Không có đề xuất video hoặc infographic' : 'No video or infographic recommendations',
    emptyDescription: vi ? 'Đánh giá đã hoàn tất và không xác định đề xuất media cần thiết cho bản thiết kế này.'
      : 'The completed evaluation identified no media recommendations needed for this blueprint.',
  };
}
