import { customApiClient } from './custom-client';

export interface TenantBadgeCourseMapping {
  course_id: string | null;
  display_name: string;
  is_deleted: boolean;
}

export interface TenantBadgeConfiguration {
  id: string;
  name: string;
  description: string;
  image_key: string;
  card_image_url: string | null;
  icon_image_url: string | null;
  mobile_card_image_url: string | null;
  sort_order: number;
  is_enabled: boolean;
  effective_enabled: boolean;
  module_enabled: boolean;
  requires_courses: boolean;
  minimum_required_courses: number;
  is_config_valid: boolean;
  rule_summary: string;
  courses: TenantBadgeCourseMapping[];
  updated_at: string | null;
}

export interface BadgeSelectableCourse {
  id: string;
  display_name: string;
  visible_to_staff_only: boolean;
}

export interface BadgeSelectableCoursePage {
  data: BadgeSelectableCourse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

type ApiResponse<T> = { success: boolean; data: T; message?: string };

function tenantRequestConfig(tenantId?: string | null) {
  return tenantId ? { headers: { 'X-Tenant-Id': tenantId } } : undefined;
}

export const tenantBadgesApi = {
  async list(tenantId?: string | null): Promise<TenantBadgeConfiguration[]> {
    const response = await customApiClient.get<ApiResponse<TenantBadgeConfiguration[]>>(
      '/api/tenant-badges',
      tenantRequestConfig(tenantId),
    );
    return response.data.data;
  },

  async listCourses(params: { search?: string; page?: number; page_size?: number }, tenantId?: string | null): Promise<BadgeSelectableCoursePage> {
    const response = await customApiClient.get<ApiResponse<BadgeSelectableCoursePage>>('/api/tenant-badges/courses', {
      ...tenantRequestConfig(tenantId),
      params,
    });
    return response.data.data;
  },

  async update(
    badgeId: string,
    input: { is_enabled: boolean; course_ids?: string[] },
    tenantId?: string | null,
  ): Promise<TenantBadgeConfiguration> {
    const response = await customApiClient.put<ApiResponse<TenantBadgeConfiguration>>(
      `/api/tenant-badges/${encodeURIComponent(badgeId)}`,
      input,
      tenantRequestConfig(tenantId),
    );
    return response.data.data;
  },
};
