export const COURSE_COMPONENT_PERMISSION_OPTIONS = [
  { type: 'video' },
  { type: 'html' },
  { type: 'problem' },
  { type: 'la_media_quiz' },
  { type: 'la_image_choice_quiz' },
  { type: 'la_scenario_chat' },
  { type: 'la_crossword' },
  { type: 'la_sortable' },
  { type: 'la_diagram' },
  { type: 'la_faq' },
  { type: 'la_pdf' },
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
