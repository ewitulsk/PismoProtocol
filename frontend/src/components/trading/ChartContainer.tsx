"use client";
import React, { useState } from "react";

type TimeFrame = "1H" | "4H" | "1D";

const ChartContainer: React.FC = () => {
  const [activeTimeFrame, setActiveTimeFrame] = useState<TimeFrame>("1H");

  const handleTimeFrameClick = (timeFrame: TimeFrame) => {
    setActiveTimeFrame(timeFrame);
  };

  return (
    <section className="chart-container">
      <div className="flex gap-4 mb-6 max-sm:flex-wrap">
        <TimeButton
          label="1H"
          isActive={activeTimeFrame === "1H"}
          onClick={() => handleTimeFrameClick("1H")}
        />
        <TimeButton
          label="4H"
          isActive={activeTimeFrame === "4H"}
          onClick={() => handleTimeFrameClick("4H")}
        />
        <TimeButton
          label="1D"
          isActive={activeTimeFrame === "1D"}
          onClick={() => handleTimeFrameClick("1D")}
        />
        <div className="px-4 py-2 ml-auto text-black rounded-lg bg-zinc-300 max-sm:mt-4 max-sm:w-full max-sm:text-center">
          ETH-USD
        </div>
      </div>
      <div className="bg-mainBackground rounded-lg h-[600px]" />
    </section>
  );
};

interface TimeButtonProps {
  label: TimeFrame;
  isActive: boolean;
  onClick: () => void;
}

const TimeButton: React.FC<TimeButtonProps> = ({
  label,
  isActive,
  onClick,
}) => {
  return (
    <button
      className={`time-button ${isActive ? "time-button-active" : "time-button-inactive"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default ChartContainer;