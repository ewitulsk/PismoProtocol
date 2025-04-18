"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@mysten/dapp-kit";
import { useRouter } from 'next/navigation';
import { useRefresh } from '@/contexts/RefreshContext';

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

interface HeaderProps {
  activePage?: 'trading' | 'vault' | 'home' | 'admin';
}

const Header: React.FC<HeaderProps> = ({ activePage = 'home' }) => {
  const router = useRouter();
  const { triggerClientRefresh } = useRefresh();

  const handleRefresh = () => {
    console.log("Refresh button clicked");
    router.refresh();
    triggerClientRefresh();
  };

  return (
    <header className="header-main flex justify-between items-center">
      <div className="flex gap-4 items-center">
        <Link href="/" className="flex justify-center items-center mr-2">
          <div className="relative w-10 h-10 overflow-hidden rounded-full">
            <Image 
              src="/images/PismoProtocolCircleLogo.png"
              alt="Pismo Protocol Logo"
              fill
              style={{ objectFit: 'cover' }}
              sizes="40px"
              priority
            />
          </div>
        </Link>
        <nav className="flex gap-2 max-sm:hidden">
          <Link 
            href="/trading" 
            className={activePage === 'trading' ? "nav-link-active" : "nav-link"}
          >
            Trade
          </Link>
          <Link 
            href="/vault" 
            className={activePage === 'vault' ? "nav-link-active" : "nav-link"}
          >
            Earn
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={handleRefresh}
          className="p-2 rounded-md hover:bg-darkBackground text-gray-400 hover:text-white transition-colors"
          title="Refresh Data"
        >
          <RefreshIcon />
        </button>
        <ConnectButton connectText="Connect Wallet" />
      </div>
    </header>
  );
};

export default Header;