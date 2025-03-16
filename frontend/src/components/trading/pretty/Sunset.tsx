"use client";
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SunsetProps {
  position?: [number, number, number];
}

export default function Sunset({ position = [0, 0, 0] }: SunsetProps) {
  const sunRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  // Animate the sun with a shimmering effect
  useFrame((state) => {
    if (!sunRef.current || !glowRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    // Subtle sun pulsing
    const pulseScale = 1 + Math.sin(time * 0.5) * 0.04;
    sunRef.current.scale.set(pulseScale, pulseScale, pulseScale);
    
    // Sun glow animation
    const glowScale = 1.05 + Math.sin(time * 0.3) * 0.05;
    glowRef.current.scale.set(glowScale, glowScale, glowScale);
    
    // Shimmer effect by adjusting opacity
    const material = glowRef.current.material as THREE.MeshStandardMaterial;
    if (material) {
      material.opacity = 0.7 + Math.sin(time * 0.7) * 0.1;
    }
  });
  
  return (
    <group position={position} rotation={[0, 0, 0]}>
      {/* Sun disk */}
      <mesh ref={sunRef}>
        <circleGeometry args={[5, 32]} />
        <meshBasicMaterial
          color="#ff7e5f" 
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Sun glow */}
      <mesh ref={glowRef}>
        <circleGeometry args={[6, 32]} />
        <meshStandardMaterial
          color="#feb47b"
          transparent={true}
          opacity={0.7}
          side={THREE.DoubleSide}
          emissive="#ff7e5f"
          emissiveIntensity={0.8}
        />
      </mesh>
      
      {/* Additional outer glow */}
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[8, 32]} />
        <meshBasicMaterial
          color="#ff9e7f"
          transparent={true}
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}