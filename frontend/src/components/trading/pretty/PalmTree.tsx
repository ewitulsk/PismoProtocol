"use client";
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PalmTreeProps {
  position?: [number, number, number];
  scale?: [number, number, number];
}

export default function PalmTree({ position = [0, 0, 0], scale = [1, 1, 1] }: PalmTreeProps) {
  const trunkRef = useRef<THREE.Mesh>(null);
  const leavesRefs = useRef<THREE.Mesh[]>([]);
  
  // Animate the leaves slightly to simulate wind
  useFrame((state) => {
    if (!trunkRef.current) return;
    
    // Subtle trunk sway
    const time = state.clock.getElapsedTime();
    const swayAmount = 0.02;
    trunkRef.current.rotation.x = Math.sin(time * 0.5) * swayAmount;
    trunkRef.current.rotation.z = Math.sin(time * 0.7) * swayAmount;
    
    // Animate each leaf with slightly different timing
    leavesRefs.current.forEach((leaf, index) => {
      if (!leaf) return;
      
      const leafTime = time * (0.5 + index * 0.05);
      const leafSwayAmount = 0.07;
      
      leaf.rotation.x = Math.sin(leafTime * 0.8) * leafSwayAmount;
      leaf.rotation.z = Math.cos(leafTime * 0.6) * leafSwayAmount;
    });
  });
  
  return (
    <group position={position} scale={scale}>
      {/* Palm trunk */}
      <mesh 
        ref={trunkRef}
        position={[0, 0.7, 0]} 
        castShadow
      >
        <cylinderGeometry args={[0.08, 0.12, 1.4, 6]} />
        <meshStandardMaterial color="#614126" roughness={0.8} />
        
        {/* Palm leaves */}
        <group position={[0, 0.7, 0]}>
          {/* Create 7 palm leaves in a circular arrangement */}
          {Array(7).fill(0).map((_, i) => {
            const angle = (i / 7) * Math.PI * 2;
            const x = Math.sin(angle) * 0.2;
            const z = Math.cos(angle) * 0.2;
            const rotation = [
              -0.3 + Math.random() * 0.2, 
              angle, 
              Math.random() * 0.3
            ];
            
            return (
              <mesh
                key={i}
                ref={(el) => { if (el) leavesRefs.current[i] = el }}
                position={[x, 0, z]}
                rotation={rotation as any}
                castShadow
              >
                {/* Create a simple tapered leaf shape */}
                <coneGeometry 
                  args={[0.2, 0.8, 5, 1, true]} 
                />
                <meshStandardMaterial
                  color="#4a9c1e"
                  roughness={0.7}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          })}
        </group>
      </mesh>
    </group>
  );
}