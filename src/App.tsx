/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SplashScreen from './components/SplashScreen';
import LoginForm from './components/LoginForm';
import MemberHome from './components/MemberHome';
import AdminPortal from './components/AdminPortal';
import { Member } from './types';
import { store } from './services/store';
import { Shield, User, ArrowLeft, LogOut, Sparkles } from 'lucide-react';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  
  // For admin roles (Swayam), allow toggling between the Admin Dashboard and their personal Member view
  const [isAdminView, setIsAdminView] = useState(true);

  // Load user from persistent cache on boot
  useEffect(() => {
    const cachedUser = store.getCurrentUser();
    if (cachedUser) {
      setCurrentUser(cachedUser);
    }
  }, []);

  const handleLogout = () => {
    store.logout();
    sessionStorage.setItem('explicit_logout', 'true');
    setCurrentUser(null);
  };

  const handleUpdateUser = (updated: Member) => {
    setCurrentUser(updated);
  };

  return (
    <div id="vajranad-root-container" className="min-h-screen bg-[#FFFDD0] text-neutral-800">
      <AnimatePresence mode="wait">
        {showSplash ? (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <SplashScreen onComplete={() => setShowSplash(false)} />
          </motion.div>
        ) : !currentUser ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <LoginForm onAuthSuccess={(user) => setCurrentUser(user)} />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* If logged-in user is the administrator, show Admin Portal directly */}
            {currentUser.email === 'admin@vajranad.com' ? (
              <AdminPortal
                adminUser={currentUser}
                onLogout={handleLogout}
              />
            ) : (
              /* Non-admin standard members are routed directly to their member tabs */
              <MemberHome
                currentUser={currentUser}
                onLogout={handleLogout}
                onUpdateUser={handleUpdateUser}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

