export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  dashboard: "Bảng điều khiển",
  library: "Thư viện",
  courses: "Khóa học",
  course_categories: "Danh mục khóa học",
  account: "Người dùng",
  groups: "Nhóm",
  permission_groups: "Nhóm quyền",
  audit_log: "Nhật ký hoạt động",
  report_summary: "Báo cáo tổng hợp",
  help_docs: "Tài liệu hướng dẫn",
  tenant_management: "Quản lí doanh nghiệp",
  branding: "Thương hiệu",
  email_templates: "Mẫu email",
  ai_chatbot: "AI Chatbot",
  enrollments: "Ghi danh khóa học",
  course_authoring: "Biên soạn khóa học",
  superadmin_only: "Quản trị hệ thống",
};

export function getModuleDisplayName(code: string, fallback?: string | null) {
  return MODULE_DISPLAY_NAMES[code] || fallback || code;
}
