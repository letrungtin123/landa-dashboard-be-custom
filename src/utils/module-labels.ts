import i18n from "@/i18n";

export const MODULE_DISPLAY_NAME_KEYS: Record<string, string> = {
  dashboard: "modules.dashboard",
  library: "modules.library",
  courses: "modules.courses",
  course_categories: "modules.courseCategories",
  account: "modules.account",
  groups: "modules.groups",
  permission_groups: "modules.permissionGroups",
  audit_log: "modules.auditLog",
  report_summary: "modules.reportSummary",
  help_docs: "modules.helpDocs",
  tenant_management: "modules.tenantManagement",
  branding: "modules.branding",
  email_templates: "modules.emailTemplates",
  ai_chatbot: "modules.aiChatbot",
  enrollments: "modules.enrollments",
  course_authoring: "modules.courseAuthoring",
  superadmin_only: "modules.superadminOnly",
};

export function getModuleDisplayName(code: string, fallback?: string | null) {
  const translationKey = MODULE_DISPLAY_NAME_KEYS[code];
  return translationKey ? i18n.t(translationKey) : fallback || code;
}
