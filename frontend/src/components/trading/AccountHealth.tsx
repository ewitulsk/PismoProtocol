"use client";
import React from "react";

interface AccountHealthProps {
  accountHealthPercentage: number;
}

const AccountHealth: React.FC<AccountHealthProps> = ({
  accountHealthPercentage,
}) => {

  const textualDisplayPercentage = Number(accountHealthPercentage.toFixed(2));
  const progressBarPercentage = Math.min(100, Math.max(0, textualDisplayPercentage));

  return (
    <section className="card border border-secondary">
      <h2 className="header-title">Account Health</h2>
      <div className="progress-container">
        <div
          className="progress-bar"
          style={{ width: `${progressBarPercentage}%` }}
        />
      </div>
      <p className="text-value">{textualDisplayPercentage}%</p>
    </section>
  );
};

export default AccountHealth;