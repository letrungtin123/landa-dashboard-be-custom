import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/layout/app-sidebar';
import { Header } from '@/layout/header';
import ChatWidget from '@/components/chat-widget/chat-widget';

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex flex-col flex-1 min-h-svh min-w-0">
        <Header />
        <main className="flex-1 relative animate-in overflow-hidden min-h-0">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="w-full h-full overflow-auto"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <ChatWidget />
    </SidebarProvider>
  );
}
