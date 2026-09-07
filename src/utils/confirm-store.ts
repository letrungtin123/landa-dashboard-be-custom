import { create } from 'zustand';
import i18n from '@/i18n';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
}

interface ConfirmStore extends ConfirmState {
  confirm: (options: ConfirmOptions) => void;
  close: () => void;
}

export const useConfirmStore = create<ConfirmStore>((set) => ({
  isOpen: false,
  title: '',
  description: '',
  confirmText: i18n.t('confirmDialog.confirm'),
  cancelText: i18n.t('confirmDialog.cancel'),
  variant: 'default',
  onConfirm: () => {},
  
  confirm: (options) => 
    set({ 
      ...options, 
      isOpen: true,
      confirmText: options.confirmText || i18n.t('confirmDialog.confirm'),
      cancelText: options.cancelText || i18n.t('confirmDialog.cancel'),
      variant: options.variant || 'default',
    }),
    
  close: () => set({ isOpen: false }),
}));

// Imperative helper function
export const confirmDialog = (options: ConfirmOptions) => {
  useConfirmStore.getState().confirm(options);
};
