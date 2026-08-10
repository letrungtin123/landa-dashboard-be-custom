import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Save, ShieldCheck, Trash2, AlertCircle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { fetchSsoConfigs, updateSsoConfig, deleteSsoConfig, type SsoConfig, type SsoProvider } from '@/api/custom-sso';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input, PasswordInput } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/utils/store';
import { useTenantStore } from '@/utils/tenant-store';

type DraftConfig = {
  is_enabled: boolean;
  client_id: string;
  client_secret: string;
  issuer_url: string;
  authorization_url: string;
  token_url: string;
  userinfo_url: string;
  scopesText: string;
  auto_register_enabled: boolean;
};

type FieldKey = keyof DraftConfig | 'endpoints';
type FieldErrors = Partial<Record<SsoProvider, Partial<Record<FieldKey, string>>>>;

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const MicrosoftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

const KeycloakIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path fill="#007EAF" d="M16 2.221L2.158 9.387v12.27L16 28.823l13.842-7.166V9.387L16 2.221zm10.748 18.064L16 25.845 5.252 20.285V10.748L16 5.188l10.748 5.56v9.537z" />
    <path fill="#007EAF" d="M16 9.608c-3.136 0-5.68 2.544-5.68 5.68s2.544 5.68 5.68 5.68c.552 0 1.085-.084 1.59-.234l-1.637-2.637h-1.666v-1.665h1.162c.15-.36.234-.754.234-1.162 0-1.763-1.432-3.194-3.194-3.194S9.294 13.508 9.294 15.271c0 1.763 1.432 3.194 3.194 3.194.524 0 1.018-.127 1.46-.347L15.353 20.3h2.385l.89-1.434h2.518l.89-1.433h2.46l.89-1.434h-8.033v-1.666h-1.077c-.452-.224-1.155-.387-1.782-.442l-.504-.002z" />
  </svg>
);

const PROVIDERS: Array<{ id: SsoProvider; title: string; description: string; icon: React.ElementType }> = [
  { id: 'google', title: 'Google', description: 'OIDC Google Workspace hoặc Google identity.', icon: GoogleIcon },
  { id: 'keycloak', title: 'Keycloak', description: 'Keycloak realm OIDC theo từng tenant.', icon: KeycloakIcon },
  { id: 'microsoft365', title: 'Microsoft 365', description: 'Microsoft Entra ID / Office 365 OIDC.', icon: MicrosoftIcon },
];

const EMPTY_DRAFT: DraftConfig = {
  is_enabled: false,
  client_id: '',
  client_secret: '',
  issuer_url: '',
  authorization_url: '',
  token_url: '',
  userinfo_url: '',
  scopesText: 'openid email profile',
  auto_register_enabled: false,
};

function toDraft(config?: SsoConfig): DraftConfig {
  if (!config) return { ...EMPTY_DRAFT };
  return {
    is_enabled: config.is_enabled,
    client_id: config.client_id || '',
    client_secret: '',
    issuer_url: config.issuer_url || '',
    authorization_url: config.authorization_url || '',
    token_url: config.token_url || '',
    userinfo_url: config.userinfo_url || '',
    scopesText: (config.scopes?.length ? config.scopes : ['openid', 'email', 'profile']).join(' '),
    auto_register_enabled: config.extra_config?.auto_register_enabled === true,
  };
}

function parseScopes(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateEnabledConfig(provider: SsoProvider, draft: DraftConfig, config?: SsoConfig): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!draft.is_enabled) return errors;

  if (!draft.client_id.trim()) {
    errors.client_id = 'Bắt buộc nhập Client ID khi bật SSO.';
  }

  if (!config?.has_secret && !draft.client_secret.trim()) {
    errors.client_secret = 'Bắt buộc nhập Client Secret khi bật SSO.';
  }

  const scopes = parseScopes(draft.scopesText);
  if (scopes.length === 0) {
    errors.scopesText = 'Bắt buộc nhập ít nhất một scope.';
  } else if (!scopes.includes('openid')) {
    errors.scopesText = 'Scope bắt buộc phải có openid.';
  }

  const urlFields: Array<keyof Pick<DraftConfig, 'issuer_url' | 'authorization_url' | 'token_url' | 'userinfo_url'>> = [
    'issuer_url',
    'authorization_url',
    'token_url',
    'userinfo_url',
  ];
  for (const field of urlFields) {
    if (!isHttpUrl(draft[field])) {
      errors[field] = 'URL phải bắt đầu bằng http:// hoặc https://.';
    }
  }

  const hasIssuer = !!draft.issuer_url.trim();
  if (provider === 'keycloak') {
    const hasManualEndpoints = !!draft.authorization_url.trim() && !!draft.token_url.trim() && !!draft.userinfo_url.trim();
    if (!hasIssuer && !hasManualEndpoints) {
      errors.endpoints = 'Keycloak cần Issuer URL hoặc đầy đủ Authorization URL, Token URL, Userinfo URL.';
    }
  }

  if (provider === 'microsoft365') {
    const hasManualEndpoints = !!draft.authorization_url.trim() && !!draft.token_url.trim();
    if (!hasIssuer && !hasManualEndpoints) {
      errors.endpoints = 'Microsoft 365 cần Issuer URL hoặc ít nhất Authorization URL và Token URL.';
    }
  }

  return errors;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 }
  }
};

export default function SsoManagementPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);
  const activeTenantName = useTenantStore((state) => state.activeTenantName);
  const tenants = useTenantStore((state) => state.tenants);
  const fetchTenants = useTenantStore((state) => state.fetchTenants);
  const [drafts, setDrafts] = useState<Record<SsoProvider, DraftConfig>>({
    google: { ...EMPTY_DRAFT },
    keycloak: { ...EMPTY_DRAFT },
    microsoft365: { ...EMPTY_DRAFT },
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (user?.role === 'superadmin' && tenants.length === 0) {
      fetchTenants();
    }
  }, [fetchTenants, tenants.length, user?.role]);

  const queryKey = useMemo(() => ['sso-configs', activeTenantId], [activeTenantId]);
  const { data: configs = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchSsoConfigs,
    enabled: user?.role === 'superadmin' && !!activeTenantId,
  });

  useEffect(() => {
    if (!configs.length) return;
    setDrafts({
      google: toDraft(configs.find((item) => item.provider === 'google')),
      keycloak: toDraft(configs.find((item) => item.provider === 'keycloak')),
      microsoft365: toDraft(configs.find((item) => item.provider === 'microsoft365')),
    });
  }, [configs]);

  const saveMutation = useMutation({
    mutationFn: ({ provider, draft }: { provider: SsoProvider; draft: DraftConfig }) => updateSsoConfig(provider, {
      is_enabled: draft.is_enabled,
      client_id: draft.client_id.trim() || null,
      client_secret: draft.client_secret.trim() || undefined,
      issuer_url: draft.issuer_url.trim() || null,
      authorization_url: draft.authorization_url.trim() || null,
      token_url: draft.token_url.trim() || null,
      userinfo_url: draft.userinfo_url.trim() || null,
      scopes: parseScopes(draft.scopesText),
      extra_config: {
        auto_register_enabled: draft.auto_register_enabled,
      },
    }),
    onSuccess: (_, variables) => {
      toast.success(`Đã lưu cấu hình ${variables.provider}`);
      queryClient.invalidateQueries({ queryKey });
      setDrafts((current) => ({
        ...current,
        [variables.provider]: { ...current[variables.provider], client_secret: '' },
      }));
      setFieldErrors((current) => ({
        ...current,
        [variables.provider]: {},
      }));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu cấu hình SSO');
    },
  });

  const clearSecretMutation = useMutation({
    mutationFn: (provider: SsoProvider) => updateSsoConfig(provider, { clear_client_secret: true }),
    onSuccess: (_, provider) => {
      toast.success(`Đã xóa client secret ${provider}`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa secret');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSsoConfig,
    onSuccess: (_, provider) => {
      toast.success(`Đã xóa cấu hình ${provider}`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa cấu hình SSO');
    },
  });

  const handleSave = (provider: SsoProvider, draft: DraftConfig, config?: SsoConfig) => {
    const validationErrors = validateEnabledConfig(provider, draft, config);
    setFieldErrors((current) => ({
      ...current,
      [provider]: validationErrors,
    }));

    if (Object.keys(validationErrors).length > 0) {
      toast.error('Vui lòng nhập đủ các trường bắt buộc trước khi lưu SSO.');
      return;
    }

    saveMutation.mutate({ provider, draft });
  };

  if (user?.role !== 'superadmin') {
    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md border-destructive/20 bg-destructive/5 shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Không có quyền truy cập</CardTitle>
              <CardDescription className="text-base">Chỉ superadmin mới được quản lý cấu hình SSO.</CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-primary">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <KeyRound className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider">Single Sign-On</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý SSO</h1>
          <p className="text-muted-foreground">
            Tenant hiện tại:{' '}
            <span className="font-semibold text-foreground">
              {activeTenantName || 'Chưa chọn tenant'}
            </span>
          </p>
        </div>
      </motion.div>

      {!activeTenantId ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="border-dashed shadow-sm">
            <CardHeader className="text-center pb-8 pt-10">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Settings2 className="h-7 w-7 text-muted-foreground" />
              </div>
              <CardTitle className="text-xl">Chưa chọn tenant</CardTitle>
              <CardDescription className="text-base mt-2">
                Hãy chọn tenant trên thanh header để cấu hình SSO riêng cho tenant đó.
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-6 xl:grid-cols-3"
        >
          {PROVIDERS.map((providerMeta) => {
            const provider = providerMeta.id;
            const draft = drafts[provider];
            const config = configs.find((item) => item.provider === provider);
            const isSaving = saveMutation.isPending && saveMutation.variables?.provider === provider;
            const isDeleting = deleteMutation.isPending && deleteMutation.variables === provider;
            const isClearing = clearSecretMutation.isPending && clearSecretMutation.variables === provider;
            const Icon = providerMeta.icon;
            const errors = fieldErrors[provider] || {};

            return (
              <motion.div key={provider} variants={itemVariants} className="h-full">
                <Card className={`group relative flex h-full flex-col overflow-hidden transition-all duration-300 hover:shadow-lg ${draft.is_enabled ? 'border-primary/40 ring-1 ring-primary/10' : ''}`}>
                  {/* Decorative gradient background */}
                  <div className="absolute inset-x-0 -top-px h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-b from-background to-muted shadow-sm transition-all duration-300 ${draft.is_enabled ? 'border-primary/30' : 'border-transparent bg-muted/50 grayscale opacity-60'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="space-y-1.5">
                          <CardTitle className="text-lg leading-none">{providerMeta.title}</CardTitle>
                          <CardDescription className="text-xs leading-relaxed line-clamp-2">{providerMeta.description}</CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={draft.is_enabled}
                        onCheckedChange={(checked) => setDrafts((current) => ({
                          ...current,
                          [provider]: { ...current[provider], is_enabled: checked },
                        }))}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-5 pb-6">
                    {isLoading ? (
                      <div className="space-y-5 py-2">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-9 w-full" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="space-y-2 group/input">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">
                            Client ID {draft.is_enabled && <span className="text-destructive">*</span>}
                          </label>
                          <Input
                            value={draft.client_id}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], client_id: event.target.value },
                            }))}
                            placeholder="OIDC client id"
                            className={`bg-muted/40 transition-colors focus:bg-background ${errors.client_id ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                          />
                          {errors.client_id && <p className="text-xs text-destructive">{errors.client_id}</p>}
                        </div>

                        <div className="space-y-2 group/input">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">
                              Client Secret {draft.is_enabled && !config?.has_secret && <span className="text-destructive">*</span>}
                            </label>
                            {config?.has_secret && (
                              <div className="inline-flex items-center rounded-md border border-emerald-200/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:border-emerald-800/50 dark:bg-emerald-500/20 dark:text-emerald-400">
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                Đã có secret
                              </div>
                            )}
                          </div>
                          <PasswordInput
                            value={draft.client_secret}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], client_secret: event.target.value },
                            }))}
                            placeholder={config?.has_secret ? 'Để trống nếu không đổi secret' : 'Nhập client secret'}
                            className={`bg-muted/40 transition-colors focus:bg-background ${errors.client_secret ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                          />
                          {errors.client_secret && <p className="text-xs text-destructive">{errors.client_secret}</p>}
                        </div>

                        <div className="app-liquid-card rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">Tu dong kich hoat learner moi</div>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                Bật: Tự động tạo account learner và không cần admin duyệt xác thực. Tắt: Cần admin duyệt xác thực account learner khi đăng nhập SSO.
                              </p>
                            </div>
                            <Switch
                              checked={draft.auto_register_enabled}
                              onCheckedChange={(checked) => setDrafts((current) => ({
                                ...current,
                                [provider]: { ...current[provider], auto_register_enabled: checked },
                              }))}
                            />
                          </div>
                        </div>

                        <div className="space-y-2 group/input">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">
                            Issuer URL {draft.is_enabled && provider !== 'google' && <span className="text-destructive">*</span>}
                          </label>
                          <Input
                            value={draft.issuer_url}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], issuer_url: event.target.value },
                            }))}
                            placeholder={provider === 'microsoft365' ? 'https://login.microsoftonline.com/{tenant-id}' : 'https://issuer.example.com'}
                            className={`bg-muted/40 transition-colors focus:bg-background ${errors.issuer_url || errors.endpoints ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                          />
                          {errors.issuer_url && <p className="text-xs text-destructive">{errors.issuer_url}</p>}
                        </div>

                        <div className="space-y-2 group/input">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">Authorization URL</label>
                          <Input
                            value={draft.authorization_url}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], authorization_url: event.target.value },
                            }))}
                            placeholder="Tùy chọn - backend có default"
                            className={`bg-muted/40 transition-colors focus:bg-background ${errors.authorization_url || errors.endpoints ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                          />
                          {errors.authorization_url && <p className="text-xs text-destructive">{errors.authorization_url}</p>}
                        </div>

                        <div className="space-y-2 group/input">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">Token URL</label>
                          <Input
                            value={draft.token_url}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], token_url: event.target.value },
                            }))}
                            placeholder="Tùy chọn - backend có default"
                            className={`bg-muted/40 transition-colors focus:bg-background ${errors.token_url || errors.endpoints ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                          />
                          {errors.token_url && <p className="text-xs text-destructive">{errors.token_url}</p>}
                        </div>

                        <div className="space-y-2 group/input">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">Userinfo URL</label>
                          <Input
                            value={draft.userinfo_url}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], userinfo_url: event.target.value },
                            }))}
                            placeholder="Tùy chọn - backend có default"
                            className={`bg-muted/40 transition-colors focus:bg-background ${errors.userinfo_url || errors.endpoints ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                          />
                          {errors.userinfo_url && <p className="text-xs text-destructive">{errors.userinfo_url}</p>}
                          {errors.endpoints && <p className="text-xs text-destructive">{errors.endpoints}</p>}
                        </div>

                        <div className="space-y-2 group/input">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-focus-within/input:text-primary transition-colors">
                            Scopes {draft.is_enabled && <span className="text-destructive">*</span>}
                          </label>
                          <Textarea
                            value={draft.scopesText}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [provider]: { ...current[provider], scopesText: event.target.value },
                            }))}
                            className={`min-h-[4.5rem] resize-none bg-muted/40 transition-colors focus:bg-background ${errors.scopesText ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                            placeholder="openid email profile"
                          />
                          {errors.scopesText && <p className="text-xs text-destructive">{errors.scopesText}</p>}
                        </div>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="mt-auto border-t bg-muted/20 px-6 py-4">
                    {isLoading ? (
                      <div className="flex w-full gap-3">
                        <Skeleton className="h-9 flex-1" />
                        <Skeleton className="h-9 flex-1" />
                      </div>
                    ) : (
                      <div className="flex w-full flex-wrap gap-2 sm:gap-3">
                        <Button
                          type="button"
                          className="flex-1 min-w-[90px] shadow-sm transition-all active:scale-95"
                          disabled={isSaving || isDeleting || isClearing}
                          onClick={() => handleSave(provider, draft, config)}
                        >
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Lưu
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1 min-w-[90px] bg-background shadow-sm transition-all hover:bg-muted active:scale-95"
                          disabled={!config?.has_secret || isSaving || isDeleting || isClearing}
                          onClick={() => clearSecretMutation.mutate(provider)}
                        >
                          Xóa secret
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="flex-1 min-w-[90px] shadow-sm transition-all active:scale-95"
                          disabled={isSaving || isDeleting || isClearing}
                          onClick={() => {
                            if (window.confirm(`Bạn có chắc chắn muốn xóa cấu hình ${providerMeta.title}?`)) {
                              deleteMutation.mutate(provider);
                            }
                          }}
                        >
                          {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                          Xóa
                        </Button>
                      </div>
                    )}
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
