import React from 'react';
import dynamic from 'next/dynamic';
import Layout from '@/components/common/Layout';

// Dynamically import the 3D scene with no SSR
const DynamicIslandTradingScene = dynamic(
  () => import('@/components/trading/pretty/IslandTradingScene'),
  { ssr: false }
);

export default function PrettyTradingPage() {
  return (
    <Layout activePage="trading">
      <section className="pretty-trading-layout">
        <div className="w-full h-screen">
          <DynamicIslandTradingScene />
        </div>
      </section>
    </Layout>
  );
}