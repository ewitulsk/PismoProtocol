"use client";
import React from "react";

const Header: React.FC = () => {
  return (
    <header className="flex justify-between items-center p-4 border-b">
      <div className="flex items-center gap-2">
        <button className="border rounded-full w-6 h-6" />
        <span className="text-lg font-semibold">Pismo Leverage Tokens</span>
      </div>
      <div className="space-x-2">
        <button className="border px-3 py-1">Mint</button>
        <button className="border px-3 py-1">Sell</button>
        <button className="border px-3 py-1">Connect Wallet</button>
      </div>
    </header>
  );
};

export default Header;