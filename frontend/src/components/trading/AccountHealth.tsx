"use client";
import React from "react";

interface AccountHealthProps {
  percentage: number;
}

const AccountHealth: React.FC<AccountHealthProps> = ({ percentage }) => {
  return (
    <section className="card">
      <h2 className="header-title">Account Health</h2>
      <div className="progress-container">
        <div
          className="progress-bar"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-value">{percentage}%</p>
    </section>
  );
};

export default AccountHealth;