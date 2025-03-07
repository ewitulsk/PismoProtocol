"use client";
import React from "react";
import Layout from "../common/Layout";
import ChartContainer from "./ChartContainer";
import AccountHealth from "./AccountHealth";
import CollateralPositions from "./CollateralPositions";
import TradePanel from "./TradePanel";

const TradingPlatform: React.FC = () => {
  return (
    <Layout activePage="trading">
      <section className="container-content">
        <ChartContainer />
        <aside className="container-aside">
          <AccountHealth percentage={85} />
          <CollateralPositions />
          <TradePanel />
        </aside>
      </section>
    </Layout>
  );
};

export default TradingPlatform;