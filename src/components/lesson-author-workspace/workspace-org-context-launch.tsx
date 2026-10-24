import { createContext, useContext, useId, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../ui/switch';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import type { createWorkspaceSourceState } from './workspace-source-state';
import { formatOrgContextDate } from './workspace-org-context.logic';

/** What the Create tab knows about the organization profile. Only the start screen tabs provide it, and only while
 * the feature is on: without it the start screen is exactly as before. */
export interface WorkspaceOrgContextLaunch {
  confirmedVersion: number | null;
  confirmedAt: string | null;
  locale: WorkspaceLocale;
  openContext: () => void;
}
const OrgContextLaunchContext = createContext<WorkspaceOrgContextLaunch | null>(null);
export const WorkspaceOrgContextLaunchProvider = OrgContextLaunchContext.Provider;

/** Start screen, under the brief: "Dùng hồ sơ doanh nghiệp (xác nhận ngày …)" with a switch the source controller
 * owns. Hidden for keep-as-is; without a confirmed profile, a short line that opens the context tab instead. */
export function WorkspaceOrgContextLaunchOption({ controller }: { controller: ReturnType<typeof createWorkspaceSourceState> }) {
  const launch = useContext(OrgContextLaunchContext);
  const { t } = useTranslation();
  const id = useId();
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  if (!launch || state.brief.design_mode !== 'instructional_design') return null;
  if (launch.confirmedVersion === null || !launch.confirmedAt) {
    return <p className="text-xs leading-5 text-muted-foreground">{t('aiIdOrgContext.launch.noProfile')}{' '}
      <button type="button" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        onClick={launch.openContext}>{t('aiIdOrgContext.launch.openContext')}</button></p>;
  }
  const choice = state.organizationContext;
  const locked = state.phase === 'creating' || state.unknown;
  return <div className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-background/60 p-3">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium">{t('aiIdOrgContext.launch.use', { date: formatOrgContextDate(launch.confirmedAt, launch.locale) })}</label>
      <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-muted-foreground">{t('aiIdOrgContext.launch.useHint')}</p>
    </div>
    {/* Below the desktop width the switch reacts to a 40px tall touch area (the label next to it also toggles it). */}
    <Switch id={id} className="mt-0.5 max-lg:after:absolute max-lg:after:inset-x-0 max-lg:after:-inset-y-[9px]" checked={!!choice?.use} aria-describedby={`${id}-hint`}
      disabled={locked || choice?.confirmedVersion !== launch.confirmedVersion} onCheckedChange={value => controller.setUseOrganizationContext(value)} />
  </div>;
}
