"use client";
import React, { useState, useRef, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import { TradingPair, tradingPairs } from '@/data/mocks/tradingPairs';
import Island from './Island';
import Ocean from './Ocean';
import PalmTree from './PalmTree';
import Sunset from './Sunset';
import Boat from './Boat';
import { timeframes } from '../TimeFrameSelector';

export default function IslandTradingScene() {
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<string>("60");
  const [selectedPair, setSelectedPair] = useState<TradingPair>(tradingPairs[0]);

  const handleTimeFrameChange = (interval: string) => {
    setSelectedTimeFrame(interval);
  };

  const handlePairSelect = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  return (
    <Canvas shadows>
      <color attach="background" args={['#030210']} />
      <fog attach="fog" args={['#030210', 5, 30]} />
      <ambientLight intensity={0.2} />
      
      {/* Main directional light (sunset) */}
      <directionalLight 
        position={[10, 5, 0]} 
        intensity={1.5} 
        color="#ff7e5f" 
        castShadow 
        shadow-mapSize-width={1024} 
        shadow-mapSize-height={1024}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      
      {/* Light from the opposite side */}
      <directionalLight position={[-5, 3, 0]} intensity={0.4} color="#feb47b" />
      
      {/* Position camera */}
      <PerspectiveCamera makeDefault position={[0, 2, 8]} fov={50} />
      <OrbitControls 
        enablePan={false}
        enableZoom={true}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2}
        minDistance={5}
        maxDistance={15}
      />
      
      <Suspense fallback={null}>
        <Island position={[0, -0.1, 0]} scale={[1, 0.5, 1]} />
        <Ocean position={[0, -0.2, 0]} />
        <PalmTree position={[1.5, 0.5, 0]} scale={[0.5, 0.5, 0.5]} />
        <Sunset position={[15, 3, -10]} />
        <Boat 
          position={[-4, 0, 2]} 
          selectedPair={selectedPair}
          selectedTimeFrame={selectedTimeFrame}
        />
        
        {/* Selectors in the sand */}
        <TimeFrameSelector3D 
          position={[-1, 0.3, 0.5]} 
          selectedTimeFrame={selectedTimeFrame} 
          onTimeFrameChange={handleTimeFrameChange} 
        />
        
        <AssetSelector3D 
          position={[1, 0.3, 0.5]} 
          selectedPair={selectedPair} 
          onPairSelect={handlePairSelect} 
        />
      </Suspense>
    </Canvas>
  );
}

interface TimeFrameSelector3DProps {
  position: [number, number, number];
  selectedTimeFrame: string;
  onTimeFrameChange: (value: string) => void;
}

function TimeFrameSelector3D({ position, selectedTimeFrame, onTimeFrameChange }: TimeFrameSelector3DProps) {
  const selectedLabel = timeframes.find(tf => tf.value === selectedTimeFrame)?.label || "1H";
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <group position={position}>
      {/* Base for the selector */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial color="#d4af37" roughness={0.8} />
      </mesh>
      
      {/* Time selector button */}
      <Html transform position={[0, 0.2, 0]} center>
        <div className="timeframe-selector-3d">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="bg-mainBackground text-white px-3 py-1.5 text-sm font-bold rounded-lg flex items-center"
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
            <div className="absolute z-20 mt-1 rounded-md shadow-lg min-w-[120px] bg-darkBackground border border-mainBackground">
              <div className="py-1 grid grid-cols-4 gap-1">
                {timeframes.map((timeframe) => (
                  <button
                    key={timeframe.value}
                    onClick={() => {
                      onTimeFrameChange(timeframe.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left block text-center px-2 py-1.5 text-xs hover:bg-mainBackground ${
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
      </Html>
      
      {/* Label */}
      <Html transform position={[0, 0.5, 0]} center>
        <div className="text-white text-sm font-bold">Time Interval</div>
      </Html>
    </group>
  );
}

interface AssetSelector3DProps {
  position: [number, number, number];
  selectedPair: TradingPair;
  onPairSelect: (pair: TradingPair) => void;
}

function AssetSelector3D({ position, selectedPair, onPairSelect }: AssetSelector3DProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredPairs = searchTerm
    ? tradingPairs.filter(
        (pair) =>
          pair.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pair.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : tradingPairs;
  
  return (
    <group position={position}>
      {/* Base for the selector */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial color="#d4af37" roughness={0.8} />
      </mesh>
      
      {/* Asset selector button */}
      <Html transform position={[0, 0.2, 0]} center>
        <div className="asset-selector-3d relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="bg-mainBackground text-white px-3 py-1.5 text-sm font-bold rounded-lg flex items-center min-w-[120px] justify-between"
          >
            <span>{selectedPair.displayName}</span>
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
            <div className="absolute right-0 z-10 mt-2 rounded-xl shadow-lg w-64 bg-darkBackground border border-mainBackground">
              <div className="p-2">
                <input
                  type="text"
                  placeholder="Search assets..."
                  className="input-field text-sm w-full px-2 py-1 bg-mainBackground text-white border border-mainBackground rounded"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {filteredPairs.length > 0 ? (
                  filteredPairs.map((pair) => (
                    <button
                      key={pair.id}
                      onClick={() => {
                        onPairSelect(pair);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center hover:bg-mainBackground ${
                        selectedPair.id === pair.id ? "bg-mainBackground" : ""
                      }`}
                    >
                      <span className="flex-1 text-white">{pair.displayName}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          pair.change24h >= 0
                            ? "bg-opacity-20 bg-green-500 text-green-400"
                            : "bg-opacity-20 bg-red-500 text-red-400"
                        }`}
                      >
                        {pair.change24h >= 0 ? "+" : ""}
                        {pair.change24h.toFixed(2)}%
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-sm text-primary">
                    No assets found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Html>
      
      {/* Label */}
      <Html transform position={[0, 0.5, 0]} center>
        <div className="text-white text-sm font-bold">Asset</div>
      </Html>
    </group>
  );
}