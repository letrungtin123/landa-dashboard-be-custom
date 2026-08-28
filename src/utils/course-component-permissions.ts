export const COURSE_COMPONENT_PERMISSION_OPTIONS = [
  { type: 'video', label: 'Video', description: 'YouTube / tải lên' },
  { type: 'html', label: 'Văn bản', description: 'Văn bản + hình ảnh' },
  { type: 'problem', label: 'Câu hỏi', description: '5 dạng câu hỏi' },
  { type: 'la_media_quiz', label: 'Câu hỏi kèm hình ảnh / video', description: 'Trả lời tuần tự' },
  { type: 'la_image_choice_quiz', label: 'Câu hỏi đáp án hình ảnh', description: 'Chọn 1 đáp án có ảnh' },
  { type: 'la_scenario_chat', label: 'Giao tiếp tình huống', description: 'Chat kịch bản' },
  { type: 'la_crossword', label: 'Ô chữ', description: 'Trò chơi tương tác' },
  { type: 'la_sortable', label: 'Sắp xếp', description: 'Kéo thả thứ tự' },
  { type: 'la_diagram', label: 'Biểu đồ', description: 'Sơ đồ tổ chức, sơ đồ tư duy' },
  { type: 'la_faq', label: 'Hỏi đáp', description: 'Câu hỏi thường gặp' },
  { type: 'la_pdf', label: 'PDF', description: 'Nhúng tài liệu PDF' },
] as const;

export type CourseComponentPermissionType = typeof COURSE_COMPONENT_PERMISSION_OPTIONS[number]['type'];

export const DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES: CourseComponentPermissionType[] =
  COURSE_COMPONENT_PERMISSION_OPTIONS.map(option => option.type);

const COURSE_COMPONENT_PERMISSION_TYPE_SET = new Set<string>(DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES);

export function normalizeCourseComponentPermissionTypes(raw: unknown): CourseComponentPermissionType[] {
  if (!Array.isArray(raw)) return [...DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES];

  const selected = new Set(
    raw.filter((type): type is CourseComponentPermissionType =>
      typeof type === 'string' && COURSE_COMPONENT_PERMISSION_TYPE_SET.has(type),
    ),
  );

  return DEFAULT_COURSE_COMPONENT_PERMISSION_TYPES.filter(type => selected.has(type));
}
