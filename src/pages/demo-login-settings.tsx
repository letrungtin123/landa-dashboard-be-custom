import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchDemoLoginConfig,
  fetchEligibleDemoLearners,
  replaceDemoLoginAccounts,
  updateDemoLoginConfig,
  type DemoLoginAccount,
  type EligibleDemoLearner,
} from "@/api/custom-demo-login";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/utils/store";
import { storageUrl } from "@/utils/storage-url";
import { useTenantStore } from "@/utils/tenant-store";
import { cn } from "@/utils/utils";
import { createQrSvg, downloadQrPng } from "@/utils/qr-code";

type SelectedAccount = {
  id?: string;
  user_id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  custom_label: string | null;
  reserved_until?: string | null;
};

function errorMessage(error: unknown, fallback: string): string {
  const maybeAxios = error as { response?: { data?: { message?: string } }; message?: string };
  return maybeAxios.response?.data?.message || maybeAxios.message || fallback;
}

function displayName(account: Pick<SelectedAccount, "custom_label" | "full_name" | "username">): string {
  return account.custom_label?.trim() || account.full_name?.trim() || account.username;
}

function toSelectedAccount(account: DemoLoginAccount): SelectedAccount {
  return {
    id: account.id,
    user_id: account.user_id,
    username: account.username,
    email: account.email,
    full_name: account.full_name,
    avatar_url: account.avatar_url,
    custom_label: account.custom_label,
    reserved_until: account.reserved_until,
  };
}

function learnerToSelected(learner: EligibleDemoLearner): SelectedAccount {
  return {
    user_id: learner.id,
    username: learner.username,
    email: learner.email,
    full_name: learner.full_name,
    avatar_url: learner.avatar_url,
    custom_label: null,
    reserved_until: null,
  };
}

function buildDemoUrl(domainLearner?: string | null): string | null {
  if (!domainLearner?.trim()) return null;
  return `${domainLearner.trim().replace(/\/+$/, "")}/demo-login`;
}

function safeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "tenant";
}

function Avatar({ account }: { account: Pick<SelectedAccount, "avatar_url" | "full_name" | "username" | "custom_label"> }) {
  const src = account.avatar_url ? storageUrl(account.avatar_url) : "";
  const label = displayName(account);
  return src ? (
    <img src={src} alt={label} className="h-10 w-10 rounded-lg object-cover ring-1 ring-border" />
  ) : (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/15">
      {(label[0] || "L").toUpperCase()}
    </div>
  );
}

export default function DemoLoginSettingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeTenantId = useTenantStore((state) => state.activeTenantId);
  const activeTenantName = useTenantStore((state) => state.activeTenantName);
  const tenants = useTenantStore((state) => state.tenants);
  const fetchTenants = useTenantStore((state) => state.fetchTenants);
  const setActiveTenant = useTenantStore((state) => state.setActiveTenant);
  const [enabled, setEnabled] = useState(false);
  const [maxAccounts, setMaxAccounts] = useState(3);
  const [ttlSeconds, setTtlSeconds] = useState(300);
  const [selectedAccounts, setSelectedAccounts] = useState<SelectedAccount[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (user?.role === "superadmin" && tenants.length === 0) {
      fetchTenants();
    }
  }, [fetchTenants, tenants.length, user?.role]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const configQueryKey = useMemo(() => ["demo-login-config", activeTenantId], [activeTenantId]);

  const { data: config, isLoading, isFetching } = useQuery({
    queryKey: configQueryKey,
    queryFn: () => fetchDemoLoginConfig(activeTenantId!),
    enabled: user?.role === "superadmin" && !!activeTenantId,
  });

  const learnerQuery = useQuery({
    queryKey: ["demo-login-eligible-learners", activeTenantId, debouncedSearch],
    queryFn: () => fetchEligibleDemoLearners(activeTenantId!, {
      search: debouncedSearch || undefined,
      page: 1,
      page_size: 8,
    }),
    enabled: user?.role === "superadmin" && !!activeTenantId,
  });

  useEffect(() => {
    if (!config) return;
    setEnabled(config.settings.is_enabled);
    setMaxAccounts(config.settings.max_demo_accounts);
    setTtlSeconds(config.settings.reservation_ttl_seconds);
    setSelectedAccounts(config.accounts.map(toSelectedAccount));
  }, [config]);

  const saveSettingsMutation = useMutation({
    mutationFn: () => updateDemoLoginConfig(activeTenantId!, {
      is_enabled: enabled,
      max_demo_accounts: maxAccounts,
      reservation_ttl_seconds: ttlSeconds,
    }),
    onSuccess: (nextConfig) => {
      toast.success("Đã lưu cấu hình demo login");
      queryClient.setQueryData(configQueryKey, nextConfig);
      queryClient.invalidateQueries({ queryKey: ["demo-login-eligible-learners", activeTenantId] });
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Không thể lưu cấu hình demo login"));
    },
  });

  const saveAccountsMutation = useMutation({
    mutationFn: () => replaceDemoLoginAccounts(
      activeTenantId!,
      selectedAccounts.map((account) => ({
        user_id: account.user_id,
        label: account.custom_label?.trim() || null,
      })),
    ),
    onSuccess: (nextConfig) => {
      toast.success("Đã lưu danh sách learner demo");
      queryClient.setQueryData(configQueryKey, nextConfig);
      queryClient.invalidateQueries({ queryKey: ["demo-login-eligible-learners", activeTenantId] });
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Không thể lưu danh sách learner demo"));
    },
  });

  const demoUrl = buildDemoUrl(config?.tenant.domain_learner);
  const qrSvg = useMemo(() => {
    if (!demoUrl) return null;
    try {
      return createQrSvg(demoUrl, { border: 4, foreground: "#020617", background: "#ffffff" });
    } catch {
      return null;
    }
  }, [demoUrl]);
  const selectedIds = useMemo(() => new Set(selectedAccounts.map((account) => account.user_id)), [selectedAccounts]);
  const eligibleLearners = (learnerQuery.data?.data || []).filter((learner) => !selectedIds.has(learner.id));
  const canAddMore = selectedAccounts.length < maxAccounts;
  const hasUnsavedCountOverLimit = selectedAccounts.length > maxAccounts;

  function handleTenantChange(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    if (tenant) setActiveTenant(tenant.id, tenant.name);
  }

  function addLearner(learner: EligibleDemoLearner) {
    if (!canAddMore) {
      toast.error(`Chỉ được chọn tối đa ${maxAccounts} tài khoản demo`);
      return;
    }
    setSelectedAccounts((current) => [...current, learnerToSelected(learner)]);
  }

  function removeLearner(userId: string) {
    setSelectedAccounts((current) => current.filter((account) => account.user_id !== userId));
  }

  function moveLearner(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedAccounts.length) return;
    setSelectedAccounts((current) => {
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function updateLabel(userId: string, label: string) {
    setSelectedAccounts((current) => current.map((account) => (
      account.user_id === userId ? { ...account, custom_label: label } : account
    )));
  }

  async function copyDemoUrl() {
    if (!demoUrl) return;
    try {
      await navigator.clipboard.writeText(demoUrl);
      toast.success("Đã copy link QR demo");
    } catch {
      toast.error("Không thể copy link tự động");
    }
  }

  async function handleDownloadQr() {
    if (!qrSvg || !demoUrl) return;
    try {
      const tenantSlug = safeFileName(config?.tenant.name || activeTenantName || "tenant");
      await downloadQrPng(qrSvg, `demo-qr-login-${tenantSlug}.png`);
      toast.success("Đã tải ảnh QR demo");
    } catch (error) {
      toast.error(errorMessage(error, "Không thể tải ảnh QR"));
    }
  }

  if (user?.role !== "superadmin") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <Card className="max-w-md border-destructive/20 bg-destructive/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle>Không có quyền truy cập</CardTitle>
            <CardDescription>Chỉ superadmin mới được quản lý demo QR login.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
            <QrCode className="h-4 w-4" />
            Demo QR Login
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Quản lý tài khoản demo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tenant hiện tại: <span className="font-semibold text-foreground">{activeTenantName || "Chưa chọn tenant"}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={activeTenantId || ""} onValueChange={handleTenantChange}>
            <SelectTrigger className="h-10 w-full sm:w-[280px]">
              <SelectValue placeholder="Chọn tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: configQueryKey })}
            disabled={!activeTenantId || isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Làm mới
          </Button>
        </div>
      </div>

      {!activeTenantId ? (
        <Card className="border-dashed">
          <CardHeader className="items-center py-12 text-center">
            <UsersRound className="mb-2 h-10 w-10 text-muted-foreground" />
            <CardTitle>Chưa chọn tenant</CardTitle>
            <CardDescription>Chọn tenant để cấu hình danh sách learner demo.</CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/25">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      Cấu hình truy cập
                    </CardTitle>
                    <CardDescription>Giới hạn số learner demo và thời gian giữ lượt.</CardDescription>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="max-demo-accounts">Số tài khoản demo</Label>
                    <Input
                      id="max-demo-accounts"
                      type="number"
                      min={1}
                      max={50}
                      value={maxAccounts}
                      onChange={(event) => setMaxAccounts(Number(event.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ttl-seconds">Thời gian reset</Label>
                    <Select value={String(ttlSeconds)} onValueChange={(value) => setTtlSeconds(Number(value))}>
                      <SelectTrigger id="ttl-seconds" className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="300">5 phút</SelectItem>
                        <SelectItem value="600">10 phút</SelectItem>
                        <SelectItem value="900">15 phút</SelectItem>
                        <SelectItem value="1800">30 phút</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-4">
                  <div className="grid gap-4 sm:grid-cols-[144px_1fr] sm:items-center">
                    <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-lg border bg-white p-2 shadow-sm sm:mx-0">
                      {qrSvg ? (
                        <div
                          className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-md bg-muted text-center text-xs text-muted-foreground">
                          <QrCode className="mb-2 h-8 w-8" />
                          Chưa có QR
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Ảnh QR demo</p>
                        <p className="mt-1 break-all text-sm text-muted-foreground">
                          {demoUrl || "Tenant chưa có domain learner"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button variant="outline" onClick={copyDemoUrl} disabled={!demoUrl}>
                          <Copy className="h-4 w-4" />
                          Copy link
                        </Button>
                        <Button variant="outline" onClick={handleDownloadQr} disabled={!qrSvg}>
                          <Download className="h-4 w-4" />
                          Tải ảnh QR
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => saveSettingsMutation.mutate()}
                  disabled={saveSettingsMutation.isPending || hasUnsavedCountOverLimit}
                >
                  {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu cấu hình
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/25">
                <CardTitle className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-primary" />
                  Learner đang được chọn
                </CardTitle>
                <CardDescription>
                  {selectedAccounts.length}/{maxAccounts} tài khoản demo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {hasUnsavedCountOverLimit ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    Giảm danh sách xuống tối đa {maxAccounts} tài khoản trước khi lưu.
                  </div>
                ) : null}

                {selectedAccounts.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Chưa có learner demo nào.
                  </div>
                ) : (
                  selectedAccounts.map((account, index) => (
                    <div key={account.user_id} className="rounded-lg border bg-background p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar account={account} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{displayName(account)}</p>
                            <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                          </div>
                        </div>
                        <Input
                          value={account.custom_label || ""}
                          placeholder={account.full_name || account.username}
                          onChange={(event) => updateLabel(account.user_id, event.target.value)}
                          className="h-9 md:w-56"
                        />
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => moveLearner(index, -1)} disabled={index === 0}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => moveLearner(index, 1)} disabled={index === selectedAccounts.length - 1}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeLearner(account.user_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => saveAccountsMutation.mutate()}
                  disabled={saveAccountsMutation.isPending || hasUnsavedCountOverLimit}
                >
                  {saveAccountsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Lưu danh sách learner
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/25">
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Thêm learner demo
              </CardTitle>
              <CardDescription>Chỉ hiển thị learner active chưa nằm trong danh sách demo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên, username hoặc email"
                  className="pl-9"
                />
              </div>

              {learnerQuery.isLoading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-20" />)}
                </div>
              ) : eligibleLearners.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Không tìm thấy learner phù hợp.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {eligibleLearners.map((learner) => {
                    const selectedShape = learnerToSelected(learner);
                    return (
                      <button
                        key={learner.id}
                        type="button"
                        className="flex min-h-20 items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canAddMore}
                        onClick={() => addLearner(learner)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar account={selectedShape} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {displayName(selectedShape)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {learner.email}
                            </span>
                          </span>
                        </span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                          <Plus className="h-4 w-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
