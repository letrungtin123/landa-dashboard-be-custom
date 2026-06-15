import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/utils/store';
import { useBrandingPublic } from '@/hooks/useBranding';
import { exchangeSsoCode, fetchPublicSsoConfigByDomain, type PublicSsoProvider, type SsoProvider } from '@/api/custom-sso';
import { openSsoPopup } from '@/utils/sso-popup';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input, PasswordInput } from '@/components/ui/input';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

const formSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập tên đăng nhập hoặc email'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const setSession = useAuthStore((s) => s.setSession);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<SsoProvider | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const { branding, isLoading: brandingLoading } = useBrandingPublic();
  const currentDomain = window.location.hostname;
  const { data: ssoConfig } = useQuery({
    queryKey: ['public-sso', currentDomain],
    queryFn: () => fetchPublicSsoConfigByDomain(currentDomain),
    staleTime: 60_000,
    retry: 1,
  });
  const ssoProviders = ssoConfig?.providers ?? [];

  const getSsoIcon = (providerId: string, className = "h-4 w-4 shrink-0") => {
    switch (providerId) {
      case 'google':
        return (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        );
      case 'microsoft365':
        return (
          <svg viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        );
      case 'keycloak':
        return (
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <path fill="#007EAF" d="M16 2.221L2.158 9.387v12.27L16 28.823l13.842-7.166V9.387L16 2.221zm10.748 18.064L16 25.845 5.252 20.285V10.748L16 5.188l10.748 5.56v9.537z" />
            <path fill="#007EAF" d="M16 9.608c-3.136 0-5.68 2.544-5.68 5.68s2.544 5.68 5.68 5.68c.552 0 1.085-.084 1.59-.234l-1.637-2.637h-1.666v-1.665h1.162c.15-.36.234-.754.234-1.162 0-1.763-1.432-3.194-3.194-3.194S9.294 13.508 9.294 15.271c0 1.763 1.432 3.194 3.194 3.194.524 0 1.018-.127 1.46-.347L15.353 20.3h2.385l.89-1.434h2.518l.89-1.433h2.46l.89-1.434h-8.033v-1.666h-1.077c-.452-.224-1.155-.387-1.782-.442l-.504-.002z" />
          </svg>
        );
      default:
        return <ShieldCheck className={className} />;
    }
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  // ── Password login ──
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setAuthError(null);
    try {
      await login(values.email, values.password);

      toast.success('Đăng nhập thành công');
      navigate('/library');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại.';
      // Parse backend error message
      if (msg.includes('không đúng')) {
        setAuthError(msg);
      } else if (msg.includes('vô hiệu hóa')) {
        setAuthError(msg);
      } else {
        setAuthError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSsoLogin(provider: PublicSsoProvider) {
    if (!ssoConfig?.tenant_id) return;

    setLoadingProvider(provider.provider);
    setAuthError(null);
    try {
      const result = await openSsoPopup(provider);
      const session = await exchangeSsoCode(provider.provider, {
        tenant_id: ssoConfig.tenant_id,
        code: result.code,
        redirect_uri: result.redirectUri,
        code_verifier: result.codeVerifier,
      });
      await setSession(session);
      toast.success('Đăng nhập SSO thành công');
      navigate('/library');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập SSO thất bại.';
      if (!msg.includes('huy')) {
        setAuthError(msg);
        toast.error(msg);
      }
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="space-y-6 w-full transform-gpu"
    >
      <div className="text-center space-y-2 relative z-10">
        <motion.div
          className="flex justify-center mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2, stiffness: 200, damping: 15 }}
        >
          <img src={branding.loginLogo} alt="Logo" className={`h-[2.5rem] w-auto drop-shadow-xl mb-3 transition-opacity duration-300 ${brandingLoading ? 'opacity-0' : 'opacity-100'}`} />
        </motion.div>
      </div>

      {/* Staff access denied banner */}
      {authError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm"
        >
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{authError}</span>
        </motion.div>
      )}

      <div className="relative rounded-2xl p-8">
        <div
          className="absolute inset-0 rounded-2xl p-[1px]"
          style={{ background: `linear-gradient(135deg, rgba(34,211,238,0.15), transparent 50%, rgba(6,182,212,0.1))` }}
        >
          <div className="h-full w-full rounded-2xl bg-[#020a1a]/40 backdrop-blur-md" />
        </div>
        <div className="relative z-10 space-y-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 font-semibold text-xs tracking-wide uppercase">
                      Username / Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="admin@example.com"
                        {...field}
                        disabled={isLoading}
                        className="h-11 bg-white/5 border-white/10 text-white hover:border-ring/50 focus:border-ring focus:ring-ring/20 transition-all cursor-text placeholder:text-white/25"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 font-semibold text-xs tracking-wide uppercase">
                      Password
                    </FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder="••••••••"
                        {...field}
                        disabled={isLoading}
                        className="h-11 bg-white/5 border-white/10 text-white hover:border-ring/50 focus:border-ring focus:ring-ring/20 transition-all cursor-text placeholder:text-white/25"
                        toggleClassName="text-white/40 hover:text-primary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="pt-2">
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full h-11 font-semibold text-md text-white cursor-pointer relative overflow-hidden shadow-lg hover:opacity-90 transition-all duration-300 hover:bg-transparent"
                  style={{ background: 'linear-gradient(to right, var(--gradient-from), var(--gradient-to))' }}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </Button>
              </motion.div>
            </form>
          </Form>

          {ssoProviders.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                  Hoặc
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid gap-2">
                {ssoProviders.map((provider) => (
                  <Button
                    key={provider.provider}
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 transition-all font-medium flex items-center justify-center gap-2"
                    disabled={isLoading || loadingProvider !== null}
                    onClick={() => handleSsoLogin(provider)}
                  >
                    {loadingProvider === provider.provider ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      getSsoIcon(provider.provider, "mr-2 h-4 w-4")
                    )}
                    {loadingProvider === provider.provider ? 'Đang kết nối...' : `Đăng nhập bằng ${provider.label}`}
                  </Button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </motion.div>
  );
}
