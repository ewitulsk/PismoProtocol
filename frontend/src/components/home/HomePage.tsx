"use client";
import React from 'react';
import Link from 'next/link';
import Layout from '../common/Layout';

const HomePage: React.FC = () => {
  return (
    <Layout activePage="home">
      <div className="flex flex-col items-center justify-center py-16">
        <h1 className="home-title">Pismo Protocol</h1>
        <p className="home-subtitle">
          Decentralized synthetic assets on Sui blockchain. Trade, earn, and build with Pismo.
        </p>
        
        <div className="home-buttons">
          <Link 
            href="/trading" 
            className="home-button"
          >
            Trading Platform
          </Link>
          <Link 
            href="/vault" 
            className="home-button-alt"
          >
            Vault Management
          </Link>
        </div>
        
        <div className="feature-grid">
          <FeatureCard 
            title="Trade Synthetic Assets" 
            description="Access a wide range of synthetic assets backed by collateral in the Pismo vaults."
          />
          <FeatureCard 
            title="Earn Yield" 
            description="Provide liquidity to vaults and earn yield on your assets."
          />
          <FeatureCard 
            title="Manage Risk" 
            description="Advanced risk management tools to monitor and adjust your positions."
          />
        </div>
        
        <footer className="footer">
          <p>© 2025 Pismo Protocol. All rights reserved.</p>
          <p className="mt-2 text-sm">This is a demo application. No real assets are involved.</p>
        </footer>
      </div>
    </Layout>
  );
};

interface FeatureCardProps {
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description }) => {
  return (
    <div className="feature-card">
      <h3 className="feature-title">{title}</h3>
      <p className="feature-description">{description}</p>
    </div>
  );
};

export default HomePage;