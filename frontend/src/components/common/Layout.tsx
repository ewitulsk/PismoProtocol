"use client";
import React, { ReactNode } from "react";
import Header from "./Header";
import { RefreshProvider } from "@/contexts/RefreshContext"; // Import the provider

interface LayoutProps {
  children: ReactNode;
  activePage?: 'trading' | 'vault' | 'home' | 'admin';
}

const Layout: React.FC<LayoutProps> = ({ children, activePage = 'home' }) => {
  return (
    <RefreshProvider> {/* Wrap with RefreshProvider */}
      <div className="container-main">
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <Header activePage={activePage} />
        <main>
          {children}
        </main>
      </div>
    </RefreshProvider>
  );
};

export default Layout;