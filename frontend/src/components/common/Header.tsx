"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@mysten/dapp-kit";
import { useRouter } from 'next/navigation';
import { useRefresh } from '@/contexts/RefreshContext';

const RefreshIcon = () => (
  <Image 
    src="/images/refresh-icon.svg"
    alt="Refresh Icon"
    width={20} // Corresponds to w-5 in Tailwind (20px)
    height={20} // Corresponds to h-5 in Tailwind (20px)
    style={{ filter: 'invert(0.5)' }}
  />
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
          <Link 
            href="/admin/mint-test-coins" 
            className={activePage === 'admin' ? "nav-link-active" : "nav-link"}
          >
            Admin
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