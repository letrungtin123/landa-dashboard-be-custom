import { useHeaderInfo } from '@/utils/header-store';

import { ModuleTabs, type ModuleTab } from '@/components/shared/module-tabs';
import DocumentsTab from '@/components/library/documents-tab';
import CategoriesTab from '@/components/library/categories-tab';


export default function LibraryPage() {
  useHeaderInfo('Library');

  const tabs: ModuleTab[] = [
    {
      key: 'documents',
      label: 'Tài liệu',
      module: 'library',
      tab: 'documents',
      component: <DocumentsTab />,
    },
    {
      key: 'categories',
      label: 'Danh mục',
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
