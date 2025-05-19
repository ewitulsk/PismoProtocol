"use client";
import React from "react";

interface AccountHealthProps {
  totalPositionDelta: number;
  totalCollateralValue: number;
}

const AccountHealth: React.FC<AccountHealthProps> = ({
  totalPositionDelta,
  totalCollateralValue,
}) => {
  // Compute account health as a percentage (0-100)
  let computedPercentage = 100;
  if (typeof totalCollateralValue === "number" && totalCollateralValue > 0) {
    computedPercentage =
      ((totalCollateralValue + totalPositionDelta) / totalCollateralValue) * 100;
  }

  const displayPercentage = Math.min(100, Math.max(0, Number(computedPercentage.toFixed(2))));

  return (
    <section className="card border border-secondary">
      <h2 className="header-title">Account Health</h2>
      <div className="progress-container">
        <div
          className="progress-bar"
          style={{ width: `${displayPercentage}%` }}
        />
      </div>
      <p className="text-value">{displayPercentage}%</p>
    </section>
  );
};

export default AccountHealth;