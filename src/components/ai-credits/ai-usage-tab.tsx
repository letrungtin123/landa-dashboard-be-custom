import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';
import { AiUsageScreen } from './ai-usage-screen';

/**
 * AI Chatbot > overview tab (lazy chunk with the charts). Visibility is decided
 * by the AI Chatbot page (canViewAiUsage); the API enforces the same rule.
 */
export default function AiUsageTab() {
  const user = useAuthStore(state => state.user);
  const activeTenantId = useTenantStore(state => state.activeTenantId);
  const superadmin = user?.role === 'superadmin';
  const tenantScope = superadmin ? activeTenantId : user?.tenant_id ?? null;
  return <AiUsageScreen tenantScope={tenantScope} requestTenantId={superadmin ? activeTenantId : null} />;
}
