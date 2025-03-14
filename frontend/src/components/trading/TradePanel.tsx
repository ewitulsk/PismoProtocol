"use client";
import React, { useState } from "react";

type PositionType = "Long" | "Short";

const TradePanel: React.FC = () => {
  const [position, setPosition] = useState<PositionType>("Long");
  const [amount, setAmount] = useState<string>("0.00");

  const handlePositionClick = (newPosition: PositionType) => {
    setPosition(newPosition);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  return (
    <section className="card">
      <div className="flex gap-4 mb-6">
        <button
          className={`position-button ${position === "Long" ? "position-button-active" : "position-button-inactive"}`}
          onClick={() => handlePositionClick("Long")}
        >
          Long
        </button>
        <button
          className={`position-button ${position === "Short" ? "position-button-active" : "position-button-inactive"}`}
          onClick={() => handlePositionClick("Short")}
        >
          Short
        </button>
      </div>

      <div className="mb-6">
        <label
          className="input-label"
          htmlFor="amount-input"
        >
          Amount
        </label>
        <input
          id="amount-input"
          type="text"
          className="input-field"
          value={amount}
          onChange={handleAmountChange}
        />
      </div>

      <div className="flex gap-2 mb-6">
        <span className="text-label">Leverage:</span>
        <span className="text-value">5x</span>
      </div>

      <button className="btn-action">
        Place Order
      </button>
    </section>
  );
};

export default TradePanel;