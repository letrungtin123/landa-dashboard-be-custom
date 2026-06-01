import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthStore } from '@/utils/store';
import logoImg from '@/assets/WhiteLogoLeftPanel.png';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input, PasswordInput } from '@/components/ui/input';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast } from 'sonner';
import { Loader2, ShieldAlert } from 'lucide-react';

const formSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập tên đăng nhập hoặc email'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
          <img src={logoImg} alt="L&A Logo" className="h-[2.5rem] w-auto drop-shadow-xl mb-3" />
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

          {/* Social login — Phase 2 */}
          {/* Sẽ thêm Google, Microsoft, Keycloak SSO ở phase sau */}

        </div>
      </div>
    </motion.div>
  );
}
