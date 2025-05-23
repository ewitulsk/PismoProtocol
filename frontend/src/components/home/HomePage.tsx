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
          Decentralized perpetuals exchange on the Sui blockchain. Trade, earn, and build with Pismo.
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
        
        <div className="home-buttons mt-4">
          <Link 
            href="https://placeholder-jira-link.com" 
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors duration-200 text-sm px-4 py-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            Jira
          </Link>
          <Link 
            href="https://github.com/ewitulsk/PismoProtocol" 
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors duration-200 text-sm px-4 py-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </Link>
        </div>
        
        <div className="feature-grid">
          <FeatureCard 
            title="Trade Any Asset" 
            description="Open long or short positions with up to 100x leverage."
          />
          <FeatureCard 
            title="Earn Yield" 
            description="Provide liquidity to vaults and earn yield on your assets."
          />
          <FeatureCard 
            title="Manage Risk" 
            description="Using our unified account model, offset your losses with your gains."
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