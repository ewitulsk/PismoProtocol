"use client";
import React from "react";
import Layout from "../common/Layout";
import ChartContainer from "./ChartContainer";
import AccountHealth from "./AccountHealth";
import ActionTabs from "./ActionTabs";
import CurrentPositions from "./CurrentPositions";
import "./trading-styles.css";

const TradingPlatform: React.FC = () => {
  return (
    <Layout activePage="trading">
      <div className="flex flex-col h-full overflow-y-auto">
        <section className="trading-layout flex-grow p-4 md:p-6 lg:p-8">
          <div className="trading-container grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="trading-chart-wrapper lg:col-span-2">
              <ChartContainer />
            </div>
            <aside className="trading-sidebar lg:col-span-1 flex flex-col gap-4">
              <AccountHealth percentage={85} />
              <ActionTabs />
            </aside>
          </div>
          <CurrentPositions />
        </section>
      </div>
    </Layout>
  );
};

export default TradingPlatform;