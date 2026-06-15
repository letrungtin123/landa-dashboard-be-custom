import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { GlobalConfirmDialog } from '@/components/global-confirm-dialog';
import { RouteProgress } from '@/components/route-progress';
import { MotionProvider } from '@/components/motion-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthGuard } from '@/components/auth-guard';
import { ModuleGuard } from '@/components/module-guard';
import { useAuthStore } from '@/utils/store';
import { config } from '@/config/env';

import AuthLayout from '@/layout/auth-layout';
import DashboardLayout from '@/layout/dashboard-layout';

import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import ProfilePage from '@/pages/profile';
import NotFoundPage from '@/pages/not-found';

import UsersPage from '@/pages/users';
import AuditLogsPage from '@/pages/audit-logs';
import ReportSummaryPage from '@/pages/report-summary';
import LibraryPage from '@/pages/library';
import CoursesPage from '@/pages/courses';
import CourseEditorPage from '@/pages/course-editor';
import GroupsPage from '@/pages/groups';
import HelpDocsPage from '@/pages/help-docs';
import CourseCategoriesPage from './pages/course-categories';
import TenantManagementPage from '@/pages/tenant-management';
import PermissionGroupsPage from '@/pages/permission-groups';
import BrandingPage from '@/pages/branding';
import AiChatbotPage from '@/pages/ai-chatbot';
import PromptTemplatesPage from '@/pages/prompt-templates';
import BadgesPage from './pages/badges';
import SsoManagementPage from '@/pages/sso-management';


function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<AuthGuard requireAuth={false} />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Route>

      {/* Protected routes */}
      <Route element={<AuthGuard requireAuth={true} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Module-guarded routes */}
          <Route path="/accounts" element={<ModuleGuard module="account"><UsersPage /></ModuleGuard>} />
          <Route path="/audit-logs" element={<ModuleGuard module="audit_log"><AuditLogsPage /></ModuleGuard>} />
          <Route path="/report-summary" element={<ModuleGuard module="report_summary"><ReportSummaryPage /></ModuleGuard>} />
          <Route path="/library" element={<ModuleGuard module="library"><LibraryPage /></ModuleGuard>} />
          <Route path="/courses" element={<ModuleGuard module="courses"><CoursesPage /></ModuleGuard>} />
          <Route path="/courses/:courseId/edit" element={<ModuleGuard module="courses"><CourseEditorPage /></ModuleGuard>} />
          <Route path="/groups" element={<ModuleGuard module="groups"><GroupsPage /></ModuleGuard>} />
          <Route path="/course-categories" element={<ModuleGuard module="course_categories"><CourseCategoriesPage /></ModuleGuard>} />
          <Route path="/help-docs" element={<ModuleGuard module="help_docs"><HelpDocsPage /></ModuleGuard>} />
          <Route path="/tenants" element={<ModuleGuard module="tenant_management"><TenantManagementPage /></ModuleGuard>} />
          <Route path="/permission-groups" element={<ModuleGuard module="permission_groups"><PermissionGroupsPage /></ModuleGuard>} />
          <Route path="/branding" element={<ModuleGuard module="branding"><BrandingPage /></ModuleGuard>} />
          <Route path="/ai-chatbot" element={<ModuleGuard module="ai_chatbot"><AiChatbotPage /></ModuleGuard>} />
          <Route path="/prompt-templates" element={<ModuleGuard module="tenant_management"><PromptTemplatesPage /></ModuleGuard>} />
          <Route path="/badges" element={<ModuleGuard module="superadmin_only"><BadgesPage /></ModuleGuard>} />
          <Route path="/sso-management" element={<ModuleGuard module="superadmin_only"><SsoManagementPage /></ModuleGuard>} />

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

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/library" replace />} />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}



export default function App() {
  // Wrap Google OAuth provider nếu có client ID
  const content = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
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
