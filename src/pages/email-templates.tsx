import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type UIEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  Info,
  Loader2,
  Lock,
  MailCheck,
  MailOpen,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getEmailTemplates,
  resetEmailTemplate,
  updateEmailTemplate,
  type EmailTemplateInput,
  type EmailTemplateKey,
  type EmailTemplateRecord,
  type EmailTemplateVariable,
} from "@/api/custom-email-templates";
import { useAuthStore } from "@/utils/store";
import { getGroupLabelSet, lowerGroupLabel, type GroupLabelMap } from "@/utils/group-labels";
import i18n, { type AppLocale } from "@/i18n";
import { formatLocaleDate } from "@/utils/locale-format";
import { useLocaleStore } from "@/utils/locale-store";
import { getLocalizedApiError } from "@/utils/localized-error";

const TEMPLATE_ORDER: EmailTemplateKey[] = [
  "course_notification",
  "assignment_created",
  "assignment_feedback",
  "team_member_added",
];

const TEMPLATE_ACCENT: Record<EmailTemplateKey, { ring: string; soft: string; dot: string }> = {
  course_notification: {
    ring: "ring-sky-500/25 border-sky-500/35",
    soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  assignment_created: {
    ring: "ring-amber-500/25 border-amber-500/35",
    soft: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  assignment_feedback: {
    ring: "ring-emerald-500/25 border-emerald-500/35",
    soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  team_member_added: {
    ring: "ring-violet-500/25 border-violet-500/35",
    soft: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};

const FRIENDLY_VARIABLE_LABEL_KEYS: Record<string, string> = {
  tenant_name: "emailTemplates.tenantName",
  brand_name: "emailTemplates.brandName",
  learner_domain: "emailTemplates.learnerDomain",
  learner_portal_url: "emailTemplates.learnerPortalUrl",
  course_name: "emailTemplates.courseName",
  notification_title: "emailTemplates.notificationTitle",
  notification_message: "emailTemplates.notificationMessage",
  assignment_title: "emailTemplates.assignmentTitle",
  assignment_question: "emailTemplates.assignmentQuestion",
  deadline_text: "emailTemplates.deadline",
  submission_unlock_text: "emailTemplates.submissionUnlock",
  learner_name: "emailTemplates.learnerName",
  learner_email: "emailTemplates.learnerEmail",
  feedback_text: "emailTemplates.feedbackText",
  feedback_by_name: "emailTemplates.feedbackByName",
  feedback_by_email: "emailTemplates.feedbackByEmail",
  score_text: "emailTemplates.score",
  course_categories_text: "emailTemplates.courseCategories",
};

type DraftMap = Partial<Record<EmailTemplateKey, EmailTemplateInput>>;
type FocusField = "subject_template" | "preheader_template" | "body_template";
type EditorElement = HTMLInputElement | HTMLTextAreaElement;
type EditorScrollState = Record<FocusField, { left: number; top: number }>;
const COURSE_CATEGORIES_TABLE_LABEL = "[Bảng danh mục khóa học]";
const GROUP_LABEL_VARIABLE_KEYS = new Set([
  "group_label",
  "subgroup_label",
  "team_label",
  "group_label_lower",
  "subgroup_label_lower",
  "team_label_lower",
]);

function isGroupLabelVariable(key: string) {
  return GROUP_LABEL_VARIABLE_KEYS.has(key);
}

function isEditableTokenVariable(variable: EmailTemplateVariable) {
  return !variable.key.endsWith("_table") && !isGroupLabelVariable(variable.key);
}

function groupAwareFriendlyLabel(key: string, groupLabels?: GroupLabelMap | null) {
  const labels = getGroupLabelSet(groupLabels);
  if (key === "group_label") return labels.group;
  if (key === "subgroup_label") return labels.subgroup;
  if (key === "team_label") return labels.team;
  if (key === "group_label_lower") return lowerGroupLabel(labels.group);
  if (key === "subgroup_label_lower") return lowerGroupLabel(labels.subgroup);
  if (key === "team_label_lower") return lowerGroupLabel(labels.team);
  if (key === "group_name") return i18n.t("emailTemplates.nameOfGroup", { group: labels.group });
  if (key === "subgroup_name") return i18n.t("emailTemplates.nameOfGroup", { group: labels.subgroup });
  if (key === "team_name") return i18n.t("emailTemplates.nameOfGroup", { group: labels.team });
  return null;
}

function friendlyLabel(variable: EmailTemplateVariable, groupLabels?: GroupLabelMap | null) {
  const dynamicLabel = groupAwareFriendlyLabel(variable.key, groupLabels);
  if (dynamicLabel) return dynamicLabel;
  const translationKey = FRIENDLY_VARIABLE_LABEL_KEYS[variable.key];
  return translationKey ? i18n.t(translationKey) : variable.label;
}

function tokenLabel(variable: EmailTemplateVariable, groupLabels?: GroupLabelMap | null) {
  return `[${friendlyLabel(variable, groupLabels)}]`;
}

function stripGroupLabelDecorators(value: string, variables: EmailTemplateVariable[], groupLabels?: GroupLabelMap | null) {
  return variables
    .filter((variable) => isGroupLabelVariable(variable.key))
    .sort((a, b) => friendlyLabel(b, groupLabels).length - friendlyLabel(a, groupLabels).length)
    .reduce((result, variable) => {
      const labelText = friendlyLabel(variable, groupLabels);
      return result.split(`[${labelText}]`).join(labelText);
    }, value);
}

function friendlyTemplateValue(variable: EmailTemplateVariable, groupLabels?: GroupLabelMap | null) {
  return isGroupLabelVariable(variable.key)
    ? friendlyLabel(variable, groupLabels)
    : tokenLabel(variable, groupLabels);
}

function tokenLabelsForTemplate(template: EmailTemplateRecord, groupLabels?: GroupLabelMap | null) {
  return Array.from(new Set(template.variables.filter(isEditableTokenVariable).map((variable) => tokenLabel(variable, groupLabels))))
    .sort((a, b) => b.length - a.length);
}

function tokenRangesInValue(value: string, tokens: string[]) {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    let index = value.indexOf(token);
    while (index !== -1) {
      ranges.push({ start: index, end: index + token.length });
      index = value.indexOf(token, index + token.length);
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function tokenRangeForEdit(value: string, tokens: string[], start: number, end: number, key: "Backspace" | "Delete") {
  const ranges = tokenRangesInValue(value, tokens);
  if (start !== end) {
    let nextStart = start;
    let nextEnd = end;
    let touchedToken = false;
    for (const range of ranges) {
      if (range.start < end && range.end > start) {
        touchedToken = true;
        nextStart = Math.min(nextStart, range.start);
        nextEnd = Math.max(nextEnd, range.end);
      }
    }
    return touchedToken ? { start: nextStart, end: nextEnd } : null;
  }

  return ranges.find((range) => (
    key === "Backspace"
      ? start > range.start && start <= range.end
      : start >= range.start && start < range.end
  )) || null;
}

function tokenRangeAtCaret(value: string, tokens: string[], position: number) {
  return tokenRangesInValue(value, tokens)
    .find((range) => position > range.start && position < range.end) || null;
}

function findInvalidTokenFragment(value: string, validTokens: Set<string>) {
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "[") {
      const closeIndex = value.indexOf("]", index + 1);
      const lineBreakIndex = value.indexOf("\n", index + 1);
      if (closeIndex === -1 || (lineBreakIndex !== -1 && lineBreakIndex < closeIndex)) {
        return value.slice(index, Math.min(value.length, index + 40));
      }

      const token = value.slice(index, closeIndex + 1);
      if (!validTokens.has(token)) return token;
      index = closeIndex;
    } else if (char === "]") {
      return value.slice(Math.max(0, index - 40), index + 1);
    }
  }
  return null;
}

function renderHighlightedEditorText(value: string, tokens: string[]) {
  if (!value) return "\u00a0";

  const ranges = tokenRangesInValue(value, tokens);
  const parts: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start < cursor) return;
    if (range.start > cursor) parts.push(value.slice(cursor, range.start));
    parts.push(
      <span
        key={`${range.start}-${range.end}-${index}`}
        className="email-template-token"
      >
        {value.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  });

  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function highlightedLayerClass(field: FocusField) {
  if (field === "subject_template") return "px-3 py-2 text-sm font-semibold leading-6";
  if (field === "preheader_template") return "px-3 py-2 text-sm leading-6";
  return "px-3 py-2 text-sm leading-7";
}

function normalizeEditorValue(field: FocusField, value: string) {
  if (field === "body_template") return value;
  return value.replace(/[\r\n]+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toFriendlyTemplate(value: string, variables: EmailTemplateVariable[], groupLabels?: GroupLabelMap | null) {
  return variables.reduce((result, variable) => {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(variable.key)}\\s*\\}\\}`, "g");
    return result.replace(pattern, friendlyTemplateValue(variable, groupLabels));
  }, value);
}

function toApiTemplate(value: string, variables: EmailTemplateVariable[], groupLabels?: GroupLabelMap | null) {
  const editableTokenVariables = variables.filter(isEditableTokenVariable);
  const systemLabelVariables = variables
    .filter((variable) => isGroupLabelVariable(variable.key))
    .sort((a, b) => friendlyLabel(b, groupLabels).length - friendlyLabel(a, groupLabels).length);

  const tokenizedValue = editableTokenVariables.reduce((result, variable) => {
    return result.split(tokenLabel(variable, groupLabels)).join(`{{${variable.key}}}`);
  }, value);

  return systemLabelVariables.reduce((result, variable) => {
    const labelText = friendlyLabel(variable, groupLabels);
    return labelText ? result.split(labelText).join(`{{${variable.key}}}`) : result;
  }, tokenizedValue);
}

function createDraft(template: EmailTemplateRecord, groupLabels?: GroupLabelMap | null): EmailTemplateInput {
  return {
    subject_template: stripGroupLabelDecorators(toFriendlyTemplate(template.subject_template, template.variables, groupLabels), template.variables, groupLabels),
    preheader_template: stripGroupLabelDecorators(toFriendlyTemplate(template.preheader_template, template.variables, groupLabels), template.variables, groupLabels),
    body_template: stripGroupLabelDecorators(toFriendlyTemplate(template.body_template, template.variables, groupLabels), template.variables, groupLabels),
  };
}

function stripDraftGroupLabelDecorators(draft: EmailTemplateInput, template: EmailTemplateRecord, groupLabels?: GroupLabelMap | null): EmailTemplateInput {
  return {
    subject_template: stripGroupLabelDecorators(draft.subject_template, template.variables, groupLabels),
    preheader_template: stripGroupLabelDecorators(draft.preheader_template, template.variables, groupLabels),
    body_template: stripGroupLabelDecorators(draft.body_template, template.variables, groupLabels),
  };
}

function toApiInput(template: EmailTemplateRecord, draft: EmailTemplateInput, groupLabels?: GroupLabelMap | null): EmailTemplateInput {
  return {
    subject_template: toApiTemplate(draft.subject_template, template.variables, groupLabels),
    preheader_template: toApiTemplate(draft.preheader_template, template.variables, groupLabels),
    body_template: toApiTemplate(draft.body_template, template.variables, groupLabels),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPreviewText(value: string, tokens: string[]) {
  const source = value || "";
  const ranges = tokenRangesInValue(source, tokens);
  const parts: string[] = [];
  let cursor = 0;

  ranges.forEach((range) => {
    if (range.start < cursor) return;
    if (range.start > cursor) parts.push(escapeHtml(source.slice(cursor, range.start)));
    parts.push(`<span style="display:inline-block;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:1px 7px;font-size:12px;line-height:18px;font-weight:800;white-space:nowrap">${escapeHtml(source.slice(range.start, range.end))}</span>`);
    cursor = range.end;
  });

  if (cursor < source.length) parts.push(escapeHtml(source.slice(cursor)));
  return parts.join("").replace(/\n/g, "<br>");
}

function renderSystemCourseCategoriesTable(tokens: string[]) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border:1px solid #dbe3ef;border-radius:18px;border-collapse:separate;border-spacing:0;background:#ffffff;overflow:hidden">
      <tr>
        <td colspan="2" style="padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:13px;line-height:20px;font-weight:900">
          ${i18n.t("emailTemplates.courseCategoriesTable")}
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:13px;line-height:20px;font-weight:800">
          ${previewTableValue(i18n.t("emailTemplates.courseCategories"), tokens)}
        </td>
        <td align="right" style="padding:13px 16px;border-bottom:1px solid #e5e7eb;color:#047857;font-size:13px;line-height:20px;font-weight:800;white-space:nowrap">
          ${previewTableValue(i18n.t("emailTemplates.courseCount"), tokens)}
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;color:#0f172a;font-size:13px;line-height:20px;font-weight:800">
          ${previewTableValue(i18n.t("emailTemplates.courseCategories"), tokens)}
        </td>
        <td align="right" style="padding:13px 16px;color:#047857;font-size:13px;line-height:20px;font-weight:800;white-space:nowrap">
          ${previewTableValue(i18n.t("emailTemplates.courseCount"), tokens)}
        </td>
      </tr>
    </table>
  `;
}

function renderPreviewBody(value: string, tokens: string[]) {
  const source = value || "";
  const chunks = source.split(COURSE_CATEGORIES_TABLE_LABEL);
  return chunks
    .map((chunk, index) => `${renderPreviewText(chunk, tokens)}${index < chunks.length - 1 ? renderSystemCourseCategoriesTable(tokens) : ""}`)
    .join("");
}

function previewTableValue(label: string, tokens: string[]) {
  return renderPreviewText(`[${label}]`, tokens);
}

function renderPreviewSystemRows(rows: Array<{ label: string; value: string }>) {
  if (rows.length === 0) return "";
  const renderedRows = rows.map((row) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;width:38%;vertical-align:top;color:#64748b;font-size:13px;line-height:20px;font-weight:800">
        ${escapeHtml(row.label)}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#0f172a;font-size:14px;line-height:22px;font-weight:800">
        ${row.value}
      </td>
    </tr>
  `).join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse">
      ${renderedRows}
    </table>
  `;
}

function renderPreviewSystemData(key: EmailTemplateKey, bodyTemplate: string, tokens: string[], groupLabels?: GroupLabelMap | null) {
  if (key === "course_notification") {
    return renderPreviewSystemRows([
      { label: i18n.t("emailTemplates.learner"), value: previewTableValue(i18n.t("emailTemplates.learnerName"), tokens) },
      { label: i18n.t("emailTemplates.courseName"), value: previewTableValue(i18n.t("emailTemplates.courseName"), tokens) },
      { label: i18n.t("emailTemplates.subject"), value: previewTableValue(i18n.t("emailTemplates.notificationTitle"), tokens) },
      { label: i18n.t("emailTemplates.learnerPortal"), value: previewTableValue(i18n.t("emailTemplates.learnerDomain"), tokens) },
    ]);
  }

  if (key === "assignment_created") {
    return renderPreviewSystemRows([
      { label: i18n.t("emailTemplates.learner"), value: previewTableValue(i18n.t("emailTemplates.learnerName"), tokens) },
      { label: i18n.t("emailTemplates.courseName"), value: previewTableValue(i18n.t("emailTemplates.courseName"), tokens) },
      { label: i18n.t("emailTemplates.assignment"), value: previewTableValue(i18n.t("emailTemplates.assignmentTitle"), tokens) },
      { label: i18n.t("emailTemplates.deadlineLabel"), value: previewTableValue(i18n.t("emailTemplates.deadline"), tokens) },
      { label: i18n.t("emailTemplates.submissionCondition"), value: previewTableValue(i18n.t("emailTemplates.submissionUnlock"), tokens) },
      { label: i18n.t("emailTemplates.learnerPortal"), value: previewTableValue(i18n.t("emailTemplates.learnerDomain"), tokens) },
    ]);
  }

  if (key === "assignment_feedback") {
    return renderPreviewSystemRows([
      { label: i18n.t("emailTemplates.learner"), value: `${previewTableValue(i18n.t("emailTemplates.learnerName"), tokens)} ${previewTableValue(i18n.t("emailTemplates.learnerEmail"), tokens)}` },
      { label: i18n.t("emailTemplates.courseName"), value: previewTableValue(i18n.t("emailTemplates.courseName"), tokens) },
      { label: i18n.t("emailTemplates.assignment"), value: previewTableValue(i18n.t("emailTemplates.assignmentTitle"), tokens) },
      { label: i18n.t("emailTemplates.feedbackBy"), value: previewTableValue(i18n.t("emailTemplates.feedbackByName"), tokens) },
      { label: i18n.t("emailTemplates.scoreStatus"), value: previewTableValue(i18n.t("emailTemplates.score"), tokens) },
      { label: i18n.t("emailTemplates.learnerPortal"), value: previewTableValue(i18n.t("emailTemplates.learnerDomain"), tokens) },
    ]);
  }

  if (key === "team_member_added") {
    const hasInlineCategoriesTable = bodyTemplate.includes(COURSE_CATEGORIES_TABLE_LABEL);
    const labels = getGroupLabelSet(groupLabels);
    return `
      ${renderPreviewSystemRows([
      { label: i18n.t("emailTemplates.learner"), value: previewTableValue(i18n.t("emailTemplates.learnerName"), tokens) },
      { label: labels.group, value: previewTableValue(i18n.t("emailTemplates.nameOfGroup", { group: labels.group }), tokens) },
      { label: labels.subgroup, value: previewTableValue(i18n.t("emailTemplates.nameOfGroup", { group: labels.subgroup }), tokens) },
      { label: labels.team, value: previewTableValue(i18n.t("emailTemplates.nameOfGroup", { group: labels.team }), tokens) },
      { label: i18n.t("emailTemplates.learnerPortal"), value: previewTableValue(i18n.t("emailTemplates.learnerDomain"), tokens) },
    ])}
      ${hasInlineCategoriesTable ? "" : renderSystemCourseCategoriesTable(tokens)}
    `;
  }

  return "";
}

function formatDateTime(value: string | null, locale: AppLocale) {
  if (!value) return i18n.t("emailTemplates.usingDefault");
  try {
    return formatLocaleDate(value, locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return i18n.t("emailTemplates.usingDefault");
  }
}

function EmailTemplateSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-5 min-[1800px]:grid-cols-[minmax(0,1fr)_minmax(520px,620px)]">
          <Skeleton className="h-[680px] rounded-2xl" />
          <Skeleton className="h-[680px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function EmailTemplatesPage() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const user = useAuthStore((state) => state.user);
  const groupLabels = useAuthStore((state) => state.groupLabels);
  const canEdit = user?.role === "superadmin" || user?.role === "superuser" || hasPermission("email_templates", "can_edit");
  const [activeKey, setActiveKey] = useState<EmailTemplateKey>("course_notification");
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [focusedField, setFocusedField] = useState<FocusField>("body_template");
  const [editorScroll, setEditorScroll] = useState<EditorScrollState>({
    subject_template: { left: 0, top: 0 },
    preheader_template: { left: 0, top: 0 },
    body_template: { left: 0, top: 0 },
  });
  const groupLabelSignature = useMemo(() => {
    const labels = getGroupLabelSet(groupLabels);
    return `${locale}|${labels.group}|${labels.subgroup}|${labels.team}`;
  }, [groupLabels, locale]);
  const draftLabelSignatureRef = useRef<string | null>(null);

  const subjectRef = useRef<HTMLTextAreaElement>(null);
  const preheaderRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const templatesQuery = useQuery({
    queryKey: ["email-templates"],
    queryFn: getEmailTemplates,
  });

  const templates = templatesQuery.data?.templates ?? [];
  const smtpStatus = templatesQuery.data?.smtp_status;
  const smtpReady = Boolean(smtpStatus?.can_send_email);
  const customizedCount = templates.filter((template) => template.is_customized).length;
  const activeTemplate = useMemo(
    () => templates.find((template) => template.template_key === activeKey) || templates[0],
    [templates, activeKey],
  );
  const draft = activeTemplate ? drafts[activeTemplate.template_key] || createDraft(activeTemplate, groupLabels) : null;
  const controlsDisabled = !smtpReady || !canEdit || templatesQuery.isLoading;
  const activeAccent = activeTemplate ? TEMPLATE_ACCENT[activeTemplate.template_key] : TEMPLATE_ACCENT.course_notification;
  const activeTokens = useMemo(
    () => activeTemplate ? tokenLabelsForTemplate(activeTemplate, groupLabels) : [],
    [activeTemplate, groupLabels],
  );
  const activeTokenSet = useMemo(() => new Set(activeTokens), [activeTokens]);

  useEffect(() => {
    if (!templates.length) return;
    const shouldRefreshLabelTokens = draftLabelSignatureRef.current !== groupLabelSignature;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const template of templates) {
        const existingDraft = next[template.template_key];
        if (!existingDraft || shouldRefreshLabelTokens) {
          next[template.template_key] = createDraft(template, groupLabels);
        } else {
          const strippedDraft = stripDraftGroupLabelDecorators(existingDraft, template, groupLabels);
          if (
            strippedDraft.subject_template !== existingDraft.subject_template
            || strippedDraft.preheader_template !== existingDraft.preheader_template
            || strippedDraft.body_template !== existingDraft.body_template
          ) {
            next[template.template_key] = strippedDraft;
          }
        }
      }
      return next;
    });
    draftLabelSignatureRef.current = groupLabelSignature;
    if (!templates.some((template) => template.template_key === activeKey)) {
      setActiveKey(templates[0].template_key);
    }
  }, [templates, activeKey, groupLabels, groupLabelSignature]);

  const saveMut = useMutation({
    mutationFn: ({ key, input }: { key: EmailTemplateKey; input: EmailTemplateInput }) => updateEmailTemplate(key, input),
    onSuccess: (updated) => {
      toast.success(t("emailTemplates.saved"));
      setDrafts((prev) => ({ ...prev, [updated.template_key]: createDraft(updated, groupLabels) }));
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
    onError: (err) => toast.error(getLocalizedApiError(err, t("emailTemplates.saveFailed"))),
  });

  const resetMut = useMutation({
    mutationFn: (key: EmailTemplateKey) => resetEmailTemplate(key),
    onSuccess: (updated) => {
      toast.success(t("emailTemplates.reset"));
      setDrafts((prev) => ({ ...prev, [updated.template_key]: createDraft(updated, groupLabels) }));
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
    onError: (err) => toast.error(getLocalizedApiError(err, t("emailTemplates.resetFailed"))),
  });

  function setDraftField(field: FocusField, value: string) {
    if (!activeTemplate) return;
    const normalizedValue = normalizeEditorValue(field, value);
    setDrafts((prev) => ({
      ...prev,
      [activeTemplate.template_key]: {
        ...(prev[activeTemplate.template_key] || createDraft(activeTemplate, groupLabels)),
        [field]: normalizedValue,
      },
    }));
  }

  function editorNode(field: FocusField): EditorElement | null {
    if (field === "subject_template") return subjectRef.current;
    if (field === "preheader_template") return preheaderRef.current;
    return bodyRef.current;
  }

  function setDraftFieldWithCursor(field: FocusField, value: string, cursor: number) {
    setDraftField(field, value);
    window.requestAnimationFrame(() => {
      const node = editorNode(field);
      node?.focus();
      node?.setSelectionRange(cursor, cursor);
    });
  }

  function handleEditorScroll(event: UIEvent<EditorElement>, field: FocusField) {
    const target = event.currentTarget;
    const next = { left: target.scrollLeft, top: target.scrollTop };
    setEditorScroll((prev) => (
      prev[field].left === next.left && prev[field].top === next.top
        ? prev
        : { ...prev, [field]: next }
    ));
  }

  function handleEditorKeyDown(event: KeyboardEvent<EditorElement>, field: FocusField) {
    if (!activeTemplate || controlsDisabled) return;
    const target = event.currentTarget;
    const value = target.value;
    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? start;

    if (event.key === "Enter" && field !== "body_template") {
      event.preventDefault();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      const range = tokenRangeForEdit(value, activeTokens, start, end, event.key);
      if (!range) return;

      event.preventDefault();
      const nextValue = `${value.slice(0, range.start)}${value.slice(range.end)}`;
      setDraftFieldWithCursor(field, nextValue, range.start);
      return;
    }

    const insertText = event.key === "Enter"
      ? "\n"
      : event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
        ? event.key
        : null;
    if (insertText === null) return;

    if (start !== end) {
      const range = tokenRangeForEdit(value, activeTokens, start, end, "Delete");
      if (!range) return;

      event.preventDefault();
      const nextValue = `${value.slice(0, range.start)}${insertText}${value.slice(range.end)}`;
      setDraftFieldWithCursor(field, nextValue, range.start + insertText.length);
      return;
    }

    const range = tokenRangeAtCaret(value, activeTokens, start);
    if (range) {
      event.preventDefault();
      target.setSelectionRange(range.end, range.end);
    }
  }

  function handleEditorPaste(event: ClipboardEvent<EditorElement>, field: FocusField) {
    if (!activeTemplate || controlsDisabled) return;
    const target = event.currentTarget;
    const value = target.value;
    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? start;
    const range = tokenRangeForEdit(value, activeTokens, start, end, "Delete")
      || tokenRangeAtCaret(value, activeTokens, start);
    if (!range) return;

    event.preventDefault();
    const pastedText = normalizeEditorValue(field, event.clipboardData.getData("text/plain"));
    const nextValue = `${value.slice(0, range.start)}${pastedText}${value.slice(range.end)}`;
    setDraftFieldWithCursor(field, nextValue, range.start + pastedText.length);
  }

  function handleEditorCut(event: ClipboardEvent<EditorElement>, field: FocusField) {
    if (!activeTemplate || controlsDisabled) return;
    const target = event.currentTarget;
    const value = target.value;
    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? start;
    if (start === end) return;

    const range = tokenRangeForEdit(value, activeTokens, start, end, "Delete");
    if (!range) return;

    event.preventDefault();
    event.clipboardData.setData("text/plain", value.slice(range.start, range.end));
    const nextValue = `${value.slice(0, range.start)}${value.slice(range.end)}`;
    setDraftFieldWithCursor(field, nextValue, range.start);
  }

  function invalidDraftToken() {
    if (!draft) return null;
    const fields: Array<{ key: FocusField; label: string }> = [
      { key: "subject_template", label: t("emailTemplates.subject") },
      { key: "preheader_template", label: t("emailTemplates.preheader") },
      { key: "body_template", label: t("emailTemplates.body") },
    ];

    for (const field of fields) {
      const fragment = findInvalidTokenFragment(draft[field.key] || "", activeTokenSet);
      if (fragment) return { ...field, fragment };
    }
    return null;
  }

  function insertToken(tokenKey: string) {
    if (!activeTemplate || !draft || controlsDisabled) return;
    const variable = activeTemplate.variables.find((item) => item.key === tokenKey);
    if (!variable) return;
    const token = tokenLabel(variable, groupLabels);
    const ref = focusedField === "subject_template"
      ? subjectRef.current
      : focusedField === "preheader_template"
        ? preheaderRef.current
        : bodyRef.current;
    const current = draft[focusedField] || "";
    const start = ref?.selectionStart ?? current.length;
    const end = ref?.selectionEnd ?? current.length;
    const prefix = current.slice(0, start);
    const suffix = current.slice(end);
    const spacer = prefix && !/\s$/.test(prefix) ? " " : "";
    const nextValue = `${prefix}${spacer}${token}${suffix}`;
    setDraftField(focusedField, nextValue);
    window.requestAnimationFrame(() => {
      ref?.focus();
      const nextCursor = prefix.length + spacer.length + token.length;
      ref?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleSave() {
    if (!activeTemplate || !draft || controlsDisabled) return;
    const invalidToken = invalidDraftToken();
    if (invalidToken) {
      toast.error(t("emailTemplates.invalidToken", { field: invalidToken.label, token: invalidToken.fragment }));
      setFocusedField(invalidToken.key);
      window.requestAnimationFrame(() => editorNode(invalidToken.key)?.focus());
      return;
    }
    saveMut.mutate({ key: activeTemplate.template_key, input: toApiInput(activeTemplate, draft, groupLabels) });
  }

  function handleReset() {
    if (!activeTemplate || controlsDisabled) return;
    resetMut.mutate(activeTemplate.template_key);
  }

  if (templatesQuery.isLoading) return <EmailTemplateSkeleton />;

  if (templatesQuery.isError || !activeTemplate || !draft) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader icon={MailCheck} title={t("emailTemplates.title")} description={t("emailTemplates.description")} />
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {t("emailTemplates.loadFailed")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader
        icon={MailCheck}
        title={t("emailTemplates.title")}
        description={t("emailTemplates.descriptionSimple")}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="gap-1.5 px-3 py-1">
              <MailOpen className="h-3.5 w-3.5" />
              {t("emailTemplates.customizedCount", { count: customizedCount, total: templates.length })}
            </Badge>
            <Badge variant={smtpReady ? "secondary" : "destructive"} className="gap-1.5 px-3 py-1">
              {smtpReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {smtpReady ? t("emailTemplates.smtpReady") : t("emailTemplates.smtpNotReady")}
            </Badge>
          </div>
        )}
      />

      {!smtpReady && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 shadow-sm dark:text-red-300"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{t("emailTemplates.smtpRequired")}</p>
              <p className="mt-1 text-xs leading-5 text-red-700/80 dark:text-red-200/80">
                {locale === "vi" && smtpStatus?.reason ? smtpStatus.reason : t("emailTemplates.smtpRequiredDescription")}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {!canEdit && smtpReady && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-700 dark:text-amber-300">
          {t("emailTemplates.viewOnly")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3">
          {TEMPLATE_ORDER.map((key, index) => {
            const template = templates.find((item) => item.template_key === key);
            if (!template) return null;
            const active = template.template_key === activeTemplate.template_key;
            const accent = TEMPLATE_ACCENT[template.template_key];
            return (
              <motion.button
                key={template.template_key}
                type="button"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => setActiveKey(template.template_key)}
                className={`app-liquid-card group w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${active ? `${accent.ring} ring-4` : "border-border hover:border-primary/25"
                  }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-3 w-3 rounded-full ${accent.dot} shadow-[0_0_0_5px_rgba(148,163,184,.12)]`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-foreground">{template.name}</p>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${active ? "translate-x-0 text-primary" : "text-muted-foreground group-hover:translate-x-0.5"}`} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.description}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant={template.is_customized ? "secondary" : "outline"} size="sm">
                        {template.is_customized ? t("emailTemplates.customized") : t("emailTemplates.default")}
                      </Badge>
                      <span className="truncate text-[11px] font-medium text-muted-foreground">{formatDateTime(template.updated_at, locale)}</span>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </aside>

        <main className="grid min-w-0 grid-cols-1 gap-5 min-[1800px]:grid-cols-[minmax(0,1fr)_minmax(520px,620px)]">
          <motion.section
            key={activeTemplate.template_key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="app-liquid-card overflow-hidden rounded-2xl border bg-card shadow-sm"
          >
            <div className="border-b border-border bg-muted/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${activeAccent.soft}`}>
                      {activeTemplate.is_customized ? t("emailTemplates.usingCustomized") : t("emailTemplates.usingDefaultTemplate")}
                    </span>
                    {controlsDisabled && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">{activeTemplate.name}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeTemplate.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleReset} disabled={controlsDisabled || resetMut.isPending} className="gap-2">
                    {resetMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    {t("emailTemplates.default")}
                  </Button>
                  <Button onClick={handleSave} disabled={controlsDisabled || saveMut.isPending} className="gap-2">
                    {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t("emailTemplates.saveTemplate")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">{t("emailTemplates.subject")}</label>
                  <div className="relative rounded-xl bg-background">
                    <div
                      aria-hidden="true"
                      className={`email-template-editor-layer pointer-events-none absolute inset-0 overflow-hidden rounded-xl ${highlightedLayerClass("subject_template")}`}
                    >
                      <div
                        className="whitespace-pre-wrap break-words"
                        style={{ transform: `translate(0, ${-editorScroll.subject_template.top}px)` }}
                      >
                        {renderHighlightedEditorText(draft.subject_template, activeTokens)}
                      </div>
                    </div>
                    <Textarea
                      ref={subjectRef}
                      value={draft.subject_template}
                      disabled={controlsDisabled}
                      onFocus={() => setFocusedField("subject_template")}
                      onScroll={(event) => handleEditorScroll(event, "subject_template")}
                      onKeyDown={(event) => handleEditorKeyDown(event, "subject_template")}
                      onPaste={(event) => handleEditorPaste(event, "subject_template")}
                      onCut={(event) => handleEditorCut(event, "subject_template")}
                      onChange={(event) => setDraftField("subject_template", event.target.value)}
                      rows={2}
                      className="email-template-editor-textarea relative z-10 min-h-[74px] resize-none rounded-xl !bg-transparent text-sm font-semibold leading-6 text-transparent caret-foreground shadow-sm selection:bg-sky-500/20 selection:text-transparent disabled:!bg-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">{t("emailTemplates.preheader")}</label>
                  <div className="relative rounded-xl bg-background">
                    <div
                      aria-hidden="true"
                      className={`email-template-editor-layer pointer-events-none absolute inset-0 overflow-hidden rounded-xl ${highlightedLayerClass("preheader_template")}`}
                    >
                      <div
                        className="whitespace-pre-wrap break-words"
                        style={{ transform: `translate(0, ${-editorScroll.preheader_template.top}px)` }}
                      >
                        {renderHighlightedEditorText(draft.preheader_template, activeTokens)}
                      </div>
                    </div>
                    <Textarea
                      ref={preheaderRef}
                      value={draft.preheader_template}
                      disabled={controlsDisabled}
                      onFocus={() => setFocusedField("preheader_template")}
                      onScroll={(event) => handleEditorScroll(event, "preheader_template")}
                      onKeyDown={(event) => handleEditorKeyDown(event, "preheader_template")}
                      onPaste={(event) => handleEditorPaste(event, "preheader_template")}
                      onCut={(event) => handleEditorCut(event, "preheader_template")}
                      onChange={(event) => setDraftField("preheader_template", event.target.value)}
                      rows={2}
                      className="email-template-editor-textarea relative z-10 min-h-[74px] resize-none rounded-xl !bg-transparent text-sm leading-6 text-transparent caret-foreground shadow-sm selection:bg-sky-500/20 selection:text-transparent disabled:!bg-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{t("emailTemplates.body")}</label>
                <div className="relative rounded-xl bg-background">
                  <div
                    aria-hidden="true"
                    className={`email-template-editor-layer pointer-events-none absolute inset-0 overflow-hidden rounded-xl ${highlightedLayerClass("body_template")}`}
                  >
                    <div
                      className="whitespace-pre-wrap break-words"
                      style={{ transform: `translate(0, ${-editorScroll.body_template.top}px)` }}
                    >
                      {renderHighlightedEditorText(draft.body_template, activeTokens)}
                    </div>
                  </div>
                  <Textarea
                    ref={bodyRef}
                    value={draft.body_template}
                    disabled={controlsDisabled}
                    onFocus={() => setFocusedField("body_template")}
                    onScroll={(event) => handleEditorScroll(event, "body_template")}
                    onKeyDown={(event) => handleEditorKeyDown(event, "body_template")}
                    onPaste={(event) => handleEditorPaste(event, "body_template")}
                    onCut={(event) => handleEditorCut(event, "body_template")}
                    onChange={(event) => setDraftField("body_template", event.target.value)}
                    className="email-template-editor-textarea relative z-10 min-h-[310px] resize-y rounded-xl !bg-transparent text-sm leading-7 text-transparent caret-foreground shadow-inner selection:bg-sky-500/20 selection:text-transparent disabled:!bg-transparent"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{t("emailTemplates.autofillData")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("emailTemplates.autofillHint")}</p>
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {t("emailTemplates.insertingInto")} {focusedField === "subject_template" ? t("emailTemplates.subject") : focusedField === "preheader_template" ? t("emailTemplates.preheader") : t("emailTemplates.body")}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeTemplate.variables.filter(isEditableTokenVariable).map((variable) => {
                    return (
                      <button
                        key={variable.key}
                        type="button"
                        disabled={controlsDisabled}
                        onClick={() => insertToken(variable.key)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {tokenLabel(variable, groupLabels)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>

          <section className="app-liquid-card overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-muted/20 p-5">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold text-foreground">{t("emailTemplates.emailPreview")}</p>
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">{t("emailTemplates.instantUpdate")}</span>
            </div>

            <div className="p-3 sm:p-5">
              <motion.div
                key={activeTemplate.template_key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-slate-100 p-3 shadow-inner dark:bg-slate-950/60 sm:p-4"
              >
                <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl">
                  <div className="bg-slate-950 px-4 py-5 sm:px-6 sm:py-6">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-300">
                        {t("emailTemplates.previewBadge")}
                      </span>
                      <Sparkles className="h-4 w-4 text-emerald-300" />
                    </div>
                    <h3 className="mt-4 text-lg font-extrabold leading-7 text-white sm:text-[24px] sm:leading-9">
                      {draft.subject_template || t("emailTemplates.defaultSubject")}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-blue-100">
                      {draft.preheader_template || t("emailTemplates.defaultPreheader")}
                    </p>
                  </div>
                  <div className="px-4 py-5 sm:px-6 sm:py-6">
                    <div
                      className="text-sm leading-7 text-slate-700"
                      dangerouslySetInnerHTML={{ __html: renderPreviewBody(draft.body_template || t("emailTemplates.defaultBody"), activeTokens) }}
                    />
                    <div
                      dangerouslySetInnerHTML={{ __html: renderPreviewSystemData(activeTemplate.template_key, draft.body_template, activeTokens, groupLabels) }}
                    />
                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">{t("emailTemplates.learnerPortal")}</p>
                      <p className="mt-1 text-sm font-bold text-emerald-950">[{t("emailTemplates.learnerDomain")}]</p>
                      <div className="mt-3 inline-flex rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm">
                        {t("emailTemplates.openLearnerPortal")}
                      </div>
                    </div>
                    <div className="mt-5 flex items-start gap-2 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{t("emailTemplates.previewHelp")}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
