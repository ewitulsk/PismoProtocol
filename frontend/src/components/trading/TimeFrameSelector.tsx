"use client";
import React, { useState, useRef, useEffect } from "react";

// Define available timeframes with their display names and values
export const timeframes = [
  { label: "1s", value: "1S" },
  { label: "10s", value: "10S" },
  { label: "30s", value: "30S" },
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "30m", value: "30" },
  { label: "1H", value: "60" },
  { label: "4H", value: "240" },
  { label: "1D", value: "1D" },
  { label: "1W", value: "1W" },
  { label: "1M", value: "1M" }
];

export type TimeFrameValue = typeof timeframes[number]['value'];
export type TimeFrameLabel = typeof timeframes[number]['label'];

interface TimeFrameSelectorProps {
  selectedTimeFrame: string;
  onTimeFrameChange: (value: string) => void;
}

const TimeFrameSelector: React.FC<TimeFrameSelectorProps> = ({
  selectedTimeFrame,
  onTimeFrameChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the currently selected timeframe label
  const selectedLabel = timeframes.find(tf => tf.value === selectedTimeFrame)?.label || "1H";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="timeframe-dropdown" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="timeframe-dropdown-button"
      >
        <span>{selectedLabel}</span>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="timeframe-dropdown-content">
          <div className="py-1">
            {timeframes.map((timeframe) => (
              <button
                key={timeframe.value}
                onClick={() => {
                  onTimeFrameChange(timeframe.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left block px-4 py-2 text-sm hover:bg-mainBackground ${
                  timeframe.value === selectedTimeFrame ? "bg-mainBackground text-primary" : "text-white"
                }`}
              >
                {timeframe.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeFrameSelector;