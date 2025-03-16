"use client";
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import LightweightChartWidget from '../LightweightChartWidget';
import { TradingPair } from '@/data/mocks/tradingPairs';

interface BoatProps {
  position?: [number, number, number];
  selectedPair: TradingPair;
  selectedTimeFrame: string;
}

export default function Boat({ 
  position = [0, 0, 0],
  selectedPair,
  selectedTimeFrame
}: BoatProps) {
  const boatRef = useRef<THREE.Group>(null);
  const billboardRef = useRef<THREE.Group>(null);
  
  // Format symbol for TradingView - remove hyphen
  const formatSymbol = (pair: TradingPair) => {
    return `${pair.baseAsset}${pair.quoteAsset}`;
  };
  
  // Animate the boat to bob up and down with the waves
  useFrame((state) => {
    if (!boatRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    // Boat bobbing on the waves
    const bobHeight = Math.sin(time * 0.5) * 0.1;
    boatRef.current.position.y = position[1] + bobHeight;
    
    // Slight rotation to simulate floating on waves
    boatRef.current.rotation.x = Math.sin(time * 0.7) * 0.05;
    boatRef.current.rotation.z = Math.sin(time * 0.3) * 0.08;
  });
  
  return (
    <group ref={boatRef} position={position}>
      {/* Boat hull (simple low-poly shape) */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.5, 0.2, 0.8]} />
        <meshStandardMaterial color="#8b4513" roughness={0.8} />
      </mesh>
      
      {/* Boat deck */}
      <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
        <boxGeometry args={[1.3, 0.1, 0.6]} />
        <meshStandardMaterial color="#a0522d" roughness={0.6} />
      </mesh>
      
      {/* Billboard support */}
      <mesh castShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[0.1, 0.7, 0.1]} />
        <meshStandardMaterial color="#6d6d6d" />
      </mesh>
      
      {/* Chart billboard */}
      <group position={[0, 1, 0]} ref={billboardRef}>
        {/* Billboard frame */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[2.5, 1.4, 0.05]} />
          <meshStandardMaterial color="#150726" />
        </mesh>
        
        {/* Trading chart */}
        <Html 
          transform 
          position={[0, 0, 0.03]} 
          scale={0.18}
          rotation={[0, 0, 0]}
          zIndexRange={[0, 1]}
          distanceFactor={1}
          style={{
            width: '800px',
            height: '400px',
            backgroundColor: 'transparent',
            overflow: 'hidden',
            borderRadius: '8px',
            border: '1px solid #00fff7'
          }}
        >
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <LightweightChartWidget 
              symbol={formatSymbol(selectedPair)} 
              interval={selectedTimeFrame}
            />
          </div>
        </Html>
      </group>
    </group>
  );
}