"use client";
import React, { useState } from "react";
import TimeFilter from "./TimeFilter";
import { VaultData } from "@/types";

interface StatsCardProps {
  activeVault: VaultData | undefined;
}

const StatsCard: React.FC<StatsCardProps> = ({ activeVault }) => {
  const [activeTimeFilter, setActiveTimeFilter] = useState<string>("1M");
  // Calculate TVL from the passed-in vaults
  const totalTVL = activeVault ? activeVault.value : 0

  // Format the TVL as currency
  const formattedTVL = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(totalTVL);

  return (
    <section className="card border border-secondary h-full flex flex-col max-sm:p-4">
      <div className="flex justify-between items-start mb-6 max-md:flex-col max-md:gap-4 max-md:items-start">
        <h2 className="header-title text-2xl max-sm:text-xl">
          Total Value Locked
        </h2>
        <p className="mt-2 text-3xl font-bold max-sm:text-2xl">{formattedTVL}</p>
        <div className="flex gap-2 max-md:justify-between max-md:w-full">
          <TimeFilter
            label="1D"
            isActive={activeTimeFilter === "1D"}
            onClick={() => setActiveTimeFilter("1D")}
          />
          <TimeFilter
            label="1W"
            isActive={activeTimeFilter === "1W"}
            onClick={() => setActiveTimeFilter("1W")}
          />
          <TimeFilter
            label="1M"
            isActive={activeTimeFilter === "1M"}
            onClick={() => setActiveTimeFilter("1M")}
          />
          <TimeFilter
            label="1Y"
            isActive={activeTimeFilter === "1Y"}
            onClick={() => setActiveTimeFilter("1Y")}
          />
        </div>
      </div>
      
      {/* Chart section */}
      <div className="relative flex-grow flex items-center justify-center">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 883 402"
          preserveAspectRatio="xMidYMid meet"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="chart-svg"
          style={{ minHeight: "300px" }}
        >
          <path
            d="M1.32812 401.5V48.1406L81.3281 38.2188L161.328 51.5L241.328 32.75L321.328 42.9062L401.328 24.1562L481.328 33.5312L561.328 17.125L641.328 20.25L721.328 10.0938L801.328 13.2188L881.328 1.5V401.5H1.32812Z"
            fill="url(#paint0_linear_4_193)"
          />
          <path
            d="M1.32812 401.5V48.1406L81.3281 38.2188L161.328 51.5L241.328 32.75L321.328 42.9062L401.328 24.1562L481.328 33.5312L561.328 17.125L641.328 20.25L721.328 10.0938L801.328 13.2188L881.328 1.5V401.5"
            stroke="#FF69B4"
            strokeWidth="2"
          />
          <defs>
            <linearGradient
              id="paint0_linear_4_193"
              x1="1.32812"
              y1="1.5"
              x2="1.32812"
              y2="401.5"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FF69B4" stopOpacity="0.2" />
              <stop offset="1" stopColor="#FF69B4" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      <div className="flex justify-between px-4 py-2 text-xs text-stone-500">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
          <div key={month}>{month}</div>
        ))}
      </div>
    </section>
  );
};

export default StatsCard;