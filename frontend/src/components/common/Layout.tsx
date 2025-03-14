"use client";
import React, { ReactNode } from "react";
import Header from "./Header";

interface LayoutProps {
  children: ReactNode;
  activePage?: 'trading' | 'vault' | 'home';
}

const Layout: React.FC<LayoutProps> = ({ children, activePage = 'home' }) => {
  return (
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
  );
};

export default Layout;