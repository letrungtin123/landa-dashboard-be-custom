/**
 * ProfilePage — Trang hồ sơ cá nhân (admin/staff)
 *
 * Tích hợp API thật:
 * - GET  /api/user/v1/accounts/{username}  → load profile
 * - PATCH /api/user/v1/accounts/{username} → update profile
 * - POST /api/profile_images/v1/{username}/upload → upload avatar
 * - POST /api/landa/v1/account/change-password/  → đổi mật khẩu
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/utils/store';
import { getRoleLabel } from '@/utils/role-labels';
import { customApiClient } from '@/api/custom-client';
import { storageUrl } from '@/utils/storage-url';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  User, Mail, Shield, Calendar, KeyRound, Camera, Check, X,
  Loader2, Eye, EyeOff, Save, Type, Users, MapPin, GraduationCap,
  Globe, Phone, FileText, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ── Maps (giống FE-5173) ──
const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  superuser: 'Tenant Admin',
  staff: 'Staff',
  learner_plus: 'Learner Plus',
  learner: 'Learner',
};
const GENDER_MAP: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const COUNTRY_MAP: Record<string, string> = { VN: 'Việt Nam', US: 'Hoa Kỳ', JP: 'Nhật Bản', KR: 'Hàn Quốc', GB: 'Anh', OTHER: 'Khác' };
const EDU_MAP: Record<string, string> = { doctorate: 'Tiến sĩ', master: 'Thạc sĩ', bachelor: 'Cử nhân', associate: 'Cao đẳng', high_school: 'THPT', junior_high: 'THCS', primary: 'Tiểu học', none: 'Không có', other: 'Khác' };
const LANG_MAP: Record<string, string> = { vi: 'Tiếng Việt', en: 'English', ja: '日本語', ko: '한국어', zh: '中文' };

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

// ── Toast Component ──
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-medium shadow-2xl backdrop-blur-xl ${
        type === 'success'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
      }`}
    >
      {type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {msg}
    </motion.div>
  );
}

// ── Select Field Helper ──
function FormSelect({ label, icon: Icon, value, onChange, options, placeholder }: {
  label: string; icon: React.ElementType; value: string;
  onChange: (v: string) => void; options: Record<string, string>; placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted-foreground" /> {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full h-11 rounded-xl bg-background border-border hover:border-primary/40 transition-colors">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const roleLabels = useAuthStore((s) => s.roleLabels);
  const updateUser = useAuthStore((s) => s.updateUser);

  // ── Profile state ──
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileData, setProfileData] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState({
    name: '', bio: '', gender: '', country: '',
    level_of_education: '', language: '', year_of_birth: '', phone_number: '',
  });

  // ── Avatar state ──
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // ── Password modal state ──
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [isSavingPw, setIsSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // ── Toast state ──
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Load profile ──
  const loadProfile = useCallback(async () => {
    if (!user?.username) return;
    setIsLoadingProfile(true);
    try {
      const { data } = await customApiClient.get(`/api/users/profile/${user.username}`);
      const profile = data.data || data;
      setProfileData(profile);
      setForm({
        name: profile.full_name || profile.name || '',
        bio: profile.bio || '',
        gender: profile.gender || '',
        country: profile.country || '',
        level_of_education: profile.level_of_education || '',
        language: profile.language || '',
        year_of_birth: profile.year_of_birth ? String(profile.year_of_birth) : '',
        phone_number: profile.phone || '',
      });
    } catch {
      setToast({ msg: 'Không thể tải hồ sơ', type: 'error' });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user?.username]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── Handle form change ──
  const handleChange = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
  };

  // ── Save profile ──
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.username) return;

    if (!form.name.trim()) {
      setToast({ msg: 'Tên hiển thị không được để trống', type: 'error' });
      return;
    }

    if (form.year_of_birth) {
      const y = parseInt(form.year_of_birth, 10);
      if (isNaN(y) || y < 1900 || y > new Date().getFullYear()) {
        setToast({ msg: 'Năm sinh không hợp lệ', type: 'error' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const { language, year_of_birth, ...rest } = form;
      const payload: Record<string, unknown> = {
        ...rest,
        language: language || '',
      };
      if (year_of_birth) payload.year_of_birth = parseInt(year_of_birth, 10);

      await customApiClient.patch('/api/users/profile', payload);

      // Upload avatar nếu có
      if (avatarFile) {
        const fd = new FormData();
        fd.append('file', avatarFile);
        const avatarRes = await customApiClient.post('/api/users/profile/avatar', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        let newAvatarUrl = avatarRes.data?.data?.avatar_url;
        if (newAvatarUrl) {
          // Cache-bust: append timestamp to prevent browser caching old image
          const resolvedUrl = storageUrl(newAvatarUrl);
          const bustUrl = `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          updateUser({ name: form.name, avatar: bustUrl, avatar_url: bustUrl });
        }
        setAvatarFile(null);
      } else {
        updateUser({ name: form.name });
      }

      await loadProfile();
      setAvatarPreview(null);
      setToast({ msg: 'Cập nhật hồ sơ thành công!', type: 'success' });
    } catch {
      setToast({ msg: 'Cập nhật thất bại. Vui lòng thử lại.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Avatar change ──
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setToast({ msg: 'Chỉ chấp nhận ảnh JPG, PNG, WebP', type: 'error' });
      return;
    }
    if (file.size > 1024 * 1024) {
      setToast({ msg: 'Ảnh quá lớn (tối đa 1MB)', type: 'error' });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  // ── Password submit ──
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');

    if (!pwForm.current.trim()) { setPwError('Vui lòng nhập mật khẩu hiện tại'); return; }
    if (pwForm.newPw.length < 8) { setPwError('Mật khẩu mới phải có ít nhất 8 ký tự'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Mật khẩu mới không khớp'); return; }
    if (pwForm.current === pwForm.newPw) { setPwError('Mật khẩu mới phải khác mật khẩu hiện tại'); return; }

    setIsSavingPw(true);
    try {
      await customApiClient.post('/api/users/profile/change-password', {
        current_password: pwForm.current,
        new_password: pwForm.newPw,
      });
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => { setShowPwModal(false); setPwSuccess(false); }, 1500);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Đổi mật khẩu thất bại';
      setPwError(msg);
    } finally {
      setIsSavingPw(false);
    }
  };

  // Sanitize profile image URL to relative path to avoid CORS on production Kong Gateway
  const sanitizeUrlToRelative = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  };

  const avatarSrc = avatarPreview
    || storageUrl(user?.avatar_url || user?.avatar || null)
    || storageUrl(profileData?.avatar_url);

  // ── Loading state ──
  if (isLoadingProfile) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto pb-12 w-full pt-2">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Hồ Sơ Cá Nhân</h1>
          <p className="text-sm text-muted-foreground mt-1">Quản lý thông tin và bảo mật tài khoản của bạn.</p>
        </div>

        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />

        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">

          {/* ═══ AVATAR & INFO HEADER ═══ */}
          <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            {/* Banner gradient */}
            <div className="h-32 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/30 dark:from-primary/40 dark:via-primary/20 dark:to-primary/10" />
            <div className="relative px-6 pb-6 lg:px-10 lg:pb-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 -mt-14">
                {/* Avatar */}
                <button
                  onClick={() => setShowAvatarModal(true)}
                  className="relative w-28 h-28 rounded-full border-4 border-card bg-muted shadow-xl flex items-center justify-center overflow-hidden group shrink-0 cursor-pointer"
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-bold text-primary">{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="h-5 w-5 text-white" />
                  </div>
                </button>
                {/* Info */}
                <div className="flex-1 text-center sm:text-left pb-1">
                  <h2 className="text-2xl font-bold text-foreground">{profileData?.name || user?.name}</h2>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-1.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {profileData?.email || user?.email}</span>
                    <span className="hidden sm:inline text-border">•</span>
                    <Badge
                      variant="outline"
                      className={`text-xs uppercase tracking-wider font-semibold ${
                          user?.role === 'superadmin'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : user?.role === 'superuser'
                            ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : user?.role === 'staff'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : user?.role === 'learner_plus'
                                ? 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                                : 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Shield className="w-3 h-3 mr-1" />{getRoleLabel(user?.role, roleLabels, ROLE_LABEL[user?.role || ''] || user?.role)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ═══ PROFILE FORM ═══ */}
          <motion.div variants={itemVariants} className="rounded-3xl border border-border bg-card shadow-sm p-6 lg:p-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
              <div>
                <h3 className="font-semibold text-foreground">Thông tin cá nhân</h3>
                <p className="text-xs text-muted-foreground">Chỉnh sửa và lưu thông tin hồ sơ của bạn</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Row: Username + Email (readonly) */}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><User className="h-4 w-4 text-muted-foreground" /> Username</label>
                  <Input value={profileData?.username || ''} disabled className="h-11 rounded-xl bg-muted/50 cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Mail className="h-4 w-4 text-muted-foreground" /> Email</label>
                  <Input value={profileData?.email || ''} disabled className="h-11 rounded-xl bg-muted/50 cursor-not-allowed" />
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Type className="h-4 w-4 text-muted-foreground" /> Tên hiển thị</label>
                <Input value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="Ví dụ: Nguyễn Văn A" className="h-11 rounded-xl" />
              </div>

              {/* Row: Gender + Country */}
              <div className="grid gap-5 md:grid-cols-2">
                <FormSelect label="Giới tính" icon={Users} value={form.gender} onChange={(v) => handleChange('gender', v)} options={GENDER_MAP} placeholder="-- Chọn --" />
                <FormSelect label="Quốc gia" icon={MapPin} value={form.country} onChange={(v) => handleChange('country', v)} options={COUNTRY_MAP} placeholder="-- Chọn --" />
              </div>

              {/* Row: Education + Language */}
              <div className="grid gap-5 md:grid-cols-2">
                <FormSelect label="Trình độ học vấn" icon={GraduationCap} value={form.level_of_education} onChange={(v) => handleChange('level_of_education', v)} options={EDU_MAP} placeholder="-- Chọn --" />
                <FormSelect label="Ngôn ngữ" icon={Globe} value={form.language} onChange={(v) => handleChange('language', v)} options={LANG_MAP} placeholder="-- Chọn --" />
              </div>

              {/* Row: Year of birth + Phone */}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Calendar className="h-4 w-4 text-muted-foreground" /> Năm sinh</label>
                  <Input type="number" min="1900" max={new Date().getFullYear()} value={form.year_of_birth} onChange={(e) => handleChange('year_of_birth', e.target.value)} placeholder="VD: 2000" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Phone className="h-4 w-4 text-muted-foreground" /> Số điện thoại</label>
                  <Input type="tel" value={form.phone_number} onChange={(e) => handleChange('phone_number', e.target.value)} placeholder="VD: 0901234567" className="h-11 rounded-xl" />
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><FileText className="h-4 w-4 text-muted-foreground" /> Tiểu sử (Bio)</label>
                <Textarea value={form.bio} onChange={(e) => handleChange('bio', e.target.value)} placeholder="Chia sẻ về bản thân bạn..." rows={4} className="rounded-xl resize-none" />
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-4 border-t border-border/50">
                <Button type="submit" disabled={isSaving} className="h-11 rounded-xl px-8 font-semibold shadow-lg shadow-primary/20">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </motion.div>

          {/* ═══ SECURITY CARD ═══ */}
          <motion.div variants={itemVariants} className="rounded-3xl border border-border bg-card shadow-sm p-6 lg:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
              <div>
                <h3 className="font-semibold text-foreground">Bảo mật tài khoản</h3>
                <p className="text-xs text-muted-foreground">Quản lý mật khẩu và bảo mật</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-foreground">Mật khẩu</div>
                <p className="text-xs text-muted-foreground mt-0.5">Đổi mật khẩu định kỳ để bảo vệ tài khoản</p>
              </div>
              <Button variant="outline" className="rounded-xl h-10 px-6 text-sm font-medium" onClick={() => { setShowPwModal(true); setPwError(''); setPwSuccess(false); setPwForm({ current: '', newPw: '', confirm: '' }); }}>
                <KeyRound className="mr-2 h-4 w-4" /> Đổi mật khẩu
              </Button>
            </div>
            {user?.created_at && (
              <div className="mt-6 pt-5 border-t border-border/50 flex items-center gap-3 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Tham gia từ <strong className="text-foreground">{format(new Date(user.created_at), 'dd/MM/yyyy')}</strong></span>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* ═══ AVATAR LIGHTBOX MODAL ═══ */}
        <AnimatePresence>
          {showAvatarModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAvatarModal(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="relative flex flex-col items-center gap-5 p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close button */}
                <button
                  onClick={() => setShowAvatarModal(false)}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Enlarged avatar */}
                <div className="w-56 h-56 rounded-2xl border-4 border-card bg-muted shadow-2xl overflow-hidden">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                      <span className="text-7xl font-bold text-primary">{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                    </div>
                  )}
                </div>

                {/* Change photo button */}
                <Button
                  variant="outline"
                  className="rounded-xl h-10 px-6 text-sm font-medium bg-card border-border shadow-lg hover:bg-muted"
                  onClick={() => { avatarInputRef.current?.click(); setShowAvatarModal(false); }}
                >
                  <Camera className="mr-2 h-4 w-4" /> Đổi ảnh đại diện
                </Button>

                {/* Upload limit note */}
                <p className="text-xs text-muted-foreground/70 text-center">
                  Chấp nhận JPG, PNG, WebP · Tối đa 1MB
                </p>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ═══ PASSWORD MODAL ═══ */}
        <AnimatePresence>
          {showPwModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-foreground">Đổi mật khẩu</h3>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowPwModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {pwSuccess ? (
                  <div className="flex flex-col items-center py-8 text-emerald-500">
                    <Check className="h-12 w-12 mb-3" />
                    <p className="font-semibold">Đổi mật khẩu thành công!</p>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    {/* Current Password */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Mật khẩu hiện tại</label>
                      <div className="relative">
                        <Input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} placeholder="Nhập mật khẩu hiện tại" className="pr-10" />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPw(!showPw)}>
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {/* New Password */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Mật khẩu mới</label>
                      <Input type={showPw ? 'text' : 'password'} value={pwForm.newPw} onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))} placeholder="Tối thiểu 8 ký tự" />
                    </div>
                    {/* Confirm Password */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Xác nhận mật khẩu mới</label>
                      <Input type={showPw ? 'text' : 'password'} value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} placeholder="Nhập lại mật khẩu mới" />
                    </div>

                    {pwError && (
                      <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {pwError}
                      </p>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPwModal(false)}>Hủy</Button>
                      <Button type="submit" className="flex-1" disabled={isSavingPw}>
                        {isSavingPw && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Đổi mật khẩu
                      </Button>
                    </div>
                  </form>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ═══ TOAST ═══ */}
        <AnimatePresence>
          {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
