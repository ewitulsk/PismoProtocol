"use client";
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

interface IslandProps {
  position?: [number, number, number];
  scale?: [number, number, number];
}

export default function Island({ position = [0, 0, 0], scale = [1, 1, 1] }: IslandProps) {
  const islandRef = useRef<THREE.Mesh>(null);
  
  // Low poly island geometry
  const createIslandGeometry = () => {
    const geometry = new THREE.CylinderGeometry(2, 2.5, 0.4, 8, 1, false);
    
    // Add some random height variation for a more natural look
    const positionAttr = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttr.count; i++) {
      vertex.fromBufferAttribute(positionAttr, i);
      
      // Only modify vertices that are not on the bottom face
      if (vertex.y > -0.19) {
        // Add some random variation to the surface
        if (Math.random() > 0.6 && vertex.y > 0) {
          vertex.y += Math.random() * 0.1;
        }
        
        // Add subtle radial variation
        const distance = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
        if (distance > 1.5 && vertex.y > 0) {
          vertex.y -= (distance - 1.5) * 0.1;
        }
      }
      
      positionAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  };
  
  return (
    <group position={[position[0], position[1], position[2]]} scale={scale}>
      {/* Island base */}
      <mesh 
        ref={islandRef} 
        receiveShadow 
        castShadow
        geometry={createIslandGeometry()}
      >
        <meshStandardMaterial
          color="#d4af37"
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}