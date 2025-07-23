"use client";
import React from "react";

interface AccountHealthProps {
  accountHealthPercentage: number;
  hasAccountInfo: boolean;
}

const AccountHealth: React.FC<AccountHealthProps> = ({
  accountHealthPercentage,
  hasAccountInfo,
}) => {

  const textualDisplayPercentage = Number(accountHealthPercentage.toFixed(2));
  const progressBarPercentage = Math.min(100, Math.max(0, textualDisplayPercentage));

  return (
    <section className="card border border-secondary">
      <h2 className="header-title">Account Health</h2>
      {hasAccountInfo ? (
        <>
          <div className="progress-container">
            <div
              className="progress-bar"
              style={{ width: `${progressBarPercentage}%` }}
            />
          </div>
          <p className="text-value">{textualDisplayPercentage}%</p>
        </>
      ) : (
        <div className="flex items-center justify-center py-8">
          <p className="text-center text-gray-400">
            Connect a wallet to see account health
          </p>
        </div>
      )}
    </section>
  );
};

export default AccountHealth;