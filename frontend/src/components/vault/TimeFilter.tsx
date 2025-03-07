"use client";
import React from "react";

interface TimeFilterProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TimeFilter: React.FC<TimeFilterProps> = ({ label, isActive, onClick }) => {
  return (
    <button
      className={`time-button ${isActive ? "time-button-active" : "time-button-inactive"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default TimeFilter;