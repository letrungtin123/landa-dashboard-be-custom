import { customApiClient } from "./custom-client";

interface ApiResponse<T> { success: boolean; data: T; message?: string; }

export type EmailTemplateKey =
  | "course_notification"
  | "assignment_created"
  | "assignment_feedback"
  | "team_member_added";

export interface EmailTemplateVariable {
  key: string;
  label: string;
  description: string;
  system?: boolean;
}

export interface EmailTemplateRecord {
  template_key: EmailTemplateKey;
  name: string;
  description: string;
  subject_template: string;
  preheader_template: string;
  body_template: string;
  variables: EmailTemplateVariable[];
  is_customized: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface EmailTemplateSmtpStatus {
  configured: boolean;
  is_enabled: boolean;
  has_password: boolean;
  can_send_email: boolean;
  host: string | null;
  from_email: string | null;
  reason: string | null;
}

export interface EmailTemplatesResult {
  smtp_status: EmailTemplateSmtpStatus;
  templates: EmailTemplateRecord[];
}

export interface EmailTemplatePreview {
  template_key: EmailTemplateKey;
  rendered_subject: string;
  rendered_preheader: string;
  rendered_body_html: string;
  rendered_text: string;
}

export interface EmailTemplateInput {
  subject_template: string;
  preheader_template: string;
  body_template: string;
}

export async function getEmailTemplates(): Promise<EmailTemplatesResult> {
  const { data } = await customApiClient.get<ApiResponse<EmailTemplatesResult>>("/api/email-templates");
  return data.data;
}

export async function updateEmailTemplate(key: EmailTemplateKey, input: EmailTemplateInput): Promise<EmailTemplateRecord> {
  const { data } = await customApiClient.put<ApiResponse<EmailTemplateRecord>>(`/api/email-templates/${key}`, input);
  return data.data;
}

export async function resetEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplateRecord> {
  const { data } = await customApiClient.post<ApiResponse<EmailTemplateRecord>>(`/api/email-templates/${key}/reset`);
  return data.data;
}

export async function previewEmailTemplate(key: EmailTemplateKey, input: EmailTemplateInput): Promise<EmailTemplatePreview> {
  const { data } = await customApiClient.post<ApiResponse<EmailTemplatePreview>>(`/api/email-templates/${key}/preview`, input);
  return data.data;
}
