"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import ConnectWalletButton from "./ConnectWalletButton";

interface HeaderProps {
  activePage?: 'trading' | 'vault' | 'home';
}

const Header: React.FC<HeaderProps> = ({ activePage = 'home' }) => {
  return (
    <header className="header-main">
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
      <ConnectWalletButton />
    </header>
  );
};

export default Header;