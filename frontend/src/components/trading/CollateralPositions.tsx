"use client";
import React, { useState } from "react";
import { ChevronIcon } from "./Icons";

type TabType = "Deposit" | "Withdraw";

const CollateralPositions: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("Deposit");
  const [isExpanded, setIsExpanded] = useState(true);

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <section className="card">
      <div className="flex justify-between items-center max-sm:flex-wrap">
        <h2 className="header-title">
          Collateral Positions
        </h2>
        <button
          className="flex justify-center items-center w-8 h-8 bg-mainBackground rounded-lg"
          onClick={toggleExpand}
        >
          <ChevronIcon />
        </button>
      </div>

      {isExpanded && (
        <div className="flex mt-8 border-b-2 border-solid border-b-transparent">
          <button
            className={`tab ${activeTab === "Deposit" ? "tab-active" : ""}`}
            onClick={() => handleTabClick("Deposit")}
          >
            Deposit
          </button>
          <button
            className={`tab ${activeTab === "Withdraw" ? "tab-active" : ""}`}
            onClick={() => handleTabClick("Withdraw")}
          >
            Withdraw
          </button>
        </div>
      )}
    </section>
  );
};

export default CollateralPositions;