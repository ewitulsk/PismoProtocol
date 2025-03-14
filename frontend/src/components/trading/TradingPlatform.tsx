"use client";
import React from "react";
import Layout from "../common/Layout";
import ChartContainer from "./ChartContainer";
import AccountHealth from "./AccountHealth";
import CollateralPositions from "./CollateralPositions";
import TradePanel from "./TradePanel";
import "./trading-styles.css";

const TradingPlatform: React.FC = () => {
  return (
    <Layout activePage="trading">
      <section className="trading-layout">
        <div className="trading-container">
          <div className="trading-chart-wrapper">
            <ChartContainer />
          </div>
          <aside className="trading-sidebar">
            <AccountHealth percentage={85} />
            <CollateralPositions />
            <TradePanel />
          </aside>
        </div>
      </section>
    </Layout>
  );
};

export default TradingPlatform;