import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { shouldRetryQuery } from '@/utils/query-retry.logic';
// Switching back to the tab no longer refetches every mounted query (a query
// that needs it sets refetchOnWindowFocus itself); 4xx answers are not retried.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
});
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from '@/components/theme-provider';
import { LocaleProvider } from '@/components/providers/locale-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { GlobalConfirmDialog } from '@/components/global-confirm-dialog';
import { RouteProgress } from '@/components/route-progress';
import { MotionProvider } from '@/components/motion-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthGuard } from '@/components/auth-guard';
import { ModuleGuard } from '@/components/module-guard';
import { SmartRedirect } from '@/components/smart-redirect';
import { useAuthStore } from '@/utils/store';
import { config } from '@/config/env';

import AuthLayout from '@/layout/auth-layout';
import DashboardLayout from '@/layout/dashboard-layout';

import LoginPage from '@/pages/login';
import NotFoundPage from '@/pages/not-found';
import { Skeleton } from '@/components/ui/skeleton';

// Every signed-in page is its own chunk: the sign-in page no longer downloads
// the editors (TipTap, React Flow), charts and reports. Each lazy page is
// rendered inside its own <LazyPage> boundary, never the shared root one.
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const ProfilePage = lazy(() => import('@/pages/profile'));
const UsersPage = lazy(() => import('@/pages/users'));
const AuditLogsPage = lazy(() => import('@/pages/audit-logs'));
const ReportSummaryPage = lazy(() => import('@/pages/report-summary'));
const LibraryPage = lazy(() => import('@/pages/library'));
const CoursesPage = lazy(() => import('@/pages/courses'));
const CourseEditorPage = lazy(() => import('@/pages/course-editor'));
const CourseAssignmentsPage = lazy(() => import('@/pages/course-assignments'));
const GroupsPage = lazy(() => import('@/pages/groups'));
const HelpDocsPage = lazy(() => import('@/pages/help-docs'));
const NewsManagementPage = lazy(() => import('@/pages/news'));
const CourseCategoriesPage = lazy(() => import('@/pages/course-categories'));
const TenantManagementPage = lazy(() => import('@/pages/tenant-management'));
const PermissionGroupsPage = lazy(() => import('@/pages/permission-groups'));
const BrandingPage = lazy(() => import('@/pages/branding'));
const EmailTemplatesPage = lazy(() => import('@/pages/email-templates'));
const AiChatbotPage = lazy(() => import('@/pages/ai-chatbot'));
const PromptTemplatesPage = lazy(() => import('@/pages/prompt-templates'));
const BadgesPage = lazy(() => import('@/pages/badges'));
const TenantBadgesPage = lazy(() => import('@/pages/tenant-badges'));
const SsoManagementPage = lazy(() => import('@/pages/sso-management'));
const DemoLoginSettingsPage = lazy(() => import('@/pages/demo-login-settings'));
// AI points pages are split out of the main chunk (charts and animations load with them).
const AiCreditsPage = lazy(() => import('@/pages/ai-credits'));
// Development only: the dynamic import is removed from production builds with this branch.
const DevAiCreditsPreviewPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev-ai-credits-preview')) : null;
const AI_CREDITS_PREVIEW_PATH = '/dev/ai-credits-preview';
// Development only, same pattern: the report branch chart with mock data.
const DevReportBranchChartPreviewPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev-report-branch-chart-preview')) : null;
const REPORT_BRANCH_CHART_PREVIEW_PATH = '/dev/report-branch-chart-preview';
// Development only, same pattern: a static import kept the workspace dialog
// (React Flow, markdown, rehype-raw) in the production main chunk.
const DevAiIdMindmapSkeletonPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev-ai-id-mindmap-skeleton')) : null;
const AI_ID_MINDMAP_SKELETON_PREVIEW_PATH = '/__dev/ai-id-mindmap-skeleton';

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" aria-busy="true"><Skeleton className="h-12 w-72 max-w-full rounded-xl" /><Skeleton className="h-64 rounded-3xl" /></div>}>
      {children}
    </Suspense>
  );
}


function AppRoutes() {
  return (
    <Routes>
      {/* Compile-time development harness: no auth, workspace or provider
          controller is mounted, and this route does not exist in production. */}
      {import.meta.env.DEV && DevAiIdMindmapSkeletonPage && <Route path={AI_ID_MINDMAP_SKELETON_PREVIEW_PATH} element={<LazyPage><DevAiIdMindmapSkeletonPage /></LazyPage>} />}
      {/* Development preview of the AI points pages with mock data: no auth, no backend. */}
      {import.meta.env.DEV && DevAiCreditsPreviewPage && <Route path={AI_CREDITS_PREVIEW_PATH} element={<LazyPage><DevAiCreditsPreviewPage /></LazyPage>} />}
      {/* Development preview of the report branch chart with mock data: no auth, no backend. */}
      {import.meta.env.DEV && DevReportBranchChartPreviewPage && <Route path={REPORT_BRANCH_CHART_PREVIEW_PATH} element={<LazyPage><DevReportBranchChartPreviewPage /></LazyPage>} />}

      {/* Public routes */}
      <Route element={<AuthGuard requireAuth={false} />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Route>

      {/* Protected routes */}
      <Route element={<AuthGuard requireAuth={true} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="/profile" element={<LazyPage><ProfilePage /></LazyPage>} />

          {/* Module-guarded routes */}
          <Route path="/accounts" element={<ModuleGuard module="account"><LazyPage><UsersPage /></LazyPage></ModuleGuard>} />
          <Route path="/audit-logs" element={<ModuleGuard module="audit_log"><LazyPage><AuditLogsPage /></LazyPage></ModuleGuard>} />
          <Route path="/report-summary" element={<ModuleGuard module="report_summary"><LazyPage><ReportSummaryPage /></LazyPage></ModuleGuard>} />
          {/* AI usage now lives in AI Chatbot > overview (old links keep working). */}
          <Route path="/ai-usage" element={<Navigate to="/ai-chatbot?tab=overview" replace />} />
          <Route path="/library" element={<ModuleGuard module="library"><LazyPage><LibraryPage /></LazyPage></ModuleGuard>} />
          <Route path="/courses" element={<ModuleGuard module="courses"><LazyPage><CoursesPage /></LazyPage></ModuleGuard>} />
          <Route path="/courses/:courseId/assignments" element={<ModuleGuard module="courses"><LazyPage><CourseAssignmentsPage /></LazyPage></ModuleGuard>} />
          <Route path="/courses/:courseId/edit" element={<ModuleGuard module="courses"><LazyPage><CourseEditorPage /></LazyPage></ModuleGuard>} />
          <Route path="/groups" element={<ModuleGuard module="groups"><LazyPage><GroupsPage /></LazyPage></ModuleGuard>} />
          <Route path="/course-categories" element={<ModuleGuard module="course_categories"><LazyPage><CourseCategoriesPage /></LazyPage></ModuleGuard>} />
          <Route path="/help-docs" element={<ModuleGuard module="help_docs"><LazyPage><HelpDocsPage /></LazyPage></ModuleGuard>} />
          <Route path="/news" element={<ModuleGuard module="news"><LazyPage><NewsManagementPage /></LazyPage></ModuleGuard>} />
          <Route path="/tenants" element={<ModuleGuard module="tenant_management"><LazyPage><TenantManagementPage /></LazyPage></ModuleGuard>} />
          <Route path="/ai-credits" element={<ModuleGuard module="superadmin_only"><LazyPage><AiCreditsPage /></LazyPage></ModuleGuard>} />
          <Route path="/permission-groups" element={<ModuleGuard module="permission_groups"><LazyPage><PermissionGroupsPage /></LazyPage></ModuleGuard>} />
          <Route path="/branding" element={<ModuleGuard module="branding"><LazyPage><BrandingPage /></LazyPage></ModuleGuard>} />
          <Route path="/email-templates" element={<ModuleGuard module="email_templates"><LazyPage><EmailTemplatesPage /></LazyPage></ModuleGuard>} />
          <Route path="/ai-chatbot" element={<ModuleGuard module="ai_chatbot"><LazyPage><AiChatbotPage /></LazyPage></ModuleGuard>} />
          <Route path="/prompt-templates" element={<ModuleGuard module="tenant_management"><LazyPage><PromptTemplatesPage /></LazyPage></ModuleGuard>} />
          <Route path="/badge-management" element={<ModuleGuard module="badge_management"><LazyPage><TenantBadgesPage /></LazyPage></ModuleGuard>} />
          <Route path="/badges" element={<ModuleGuard module="superadmin_only"><LazyPage><BadgesPage /></LazyPage></ModuleGuard>} />
          <Route path="/sso-management" element={<ModuleGuard module="superadmin_only"><LazyPage><SsoManagementPage /></LazyPage></ModuleGuard>} />
          <Route path="/demo-login-settings" element={<ModuleGuard module="superadmin_only"><LazyPage><DemoLoginSettingsPage /></LazyPage></ModuleGuard>} />

          {/* Legacy redirects */}
          <Route path="/user" element={<Navigate to="/accounts" replace />} />
          <Route path="/report" element={<Navigate to="/report-summary" replace />} />
          <Route path="/user/account" element={<Navigate to="/accounts" replace />} />
          <Route path="/user/audit-log" element={<Navigate to="/audit-logs" replace />} />
          <Route path="/report/summary" element={<Navigate to="/report-summary" replace />} />
          <Route path="/users" element={<Navigate to="/accounts" replace />} />

          {/* 404 within dashboard */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      {/* Default redirect — tự tìm module đầu tiên mà user có quyền */}
      <Route path="/" element={<SmartRedirect />} />
      <Route path="*" element={<SmartRedirect />} />
    </Routes>
  );
}



export default function App() {
  // Wrap Google OAuth provider nếu có client ID
  const content = (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>
            <AuthProvider>
              <MotionProvider>
                <Suspense fallback={null}>
                  <RouteProgress />
                </Suspense>
                <AppRoutes />
                <Toaster position="top-right" richColors />
                <GlobalConfirmDialog />
              </MotionProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );

  if (config.googleClientId) {
    return (
      <GoogleOAuthProvider clientId={config.googleClientId}>
        {content}
      </GoogleOAuthProvider>
    );
  }

  return content;
}
