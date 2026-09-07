import { useHeaderInfo } from '@/utils/header-store';
import { useTranslation } from 'react-i18next';

import { ModuleTabs, type ModuleTab } from '@/components/shared/module-tabs';
import DocumentsTab from '@/components/library/documents-tab';
import CategoriesTab from '@/components/library/categories-tab';


export default function LibraryPage() {
  const { t } = useTranslation();
  useHeaderInfo(t('modules.library'));

  const tabs: ModuleTab[] = [
    {
      key: 'documents',
      label: t('library.documentsTab'),
      module: 'library',
      tab: 'documents',
      component: <DocumentsTab />,
    },
    {
      key: 'categories',
      label: t('library.categoriesTab'),
      module: 'library',
      tab: 'categories',
      component: <CategoriesTab />,
    },
  ];

  return (
    <div>
      <div className="px-6 pt-4">

      </div>
      <ModuleTabs tabs={tabs} defaultTab="documents" />
    </div>
  );
}
