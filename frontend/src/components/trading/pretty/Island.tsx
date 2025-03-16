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
  
  // Completely redesigned low-poly beach platform
  const createIslandGeometry = () => {
    // Start with a box geometry instead of a cylinder for better control
    const geometry = new THREE.BoxGeometry(6, 0.3, 7, 10, 1, 10);
    
    // Add some subtle height variation for a more natural look
    const positionAttr = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttr.count; i++) {
      vertex.fromBufferAttribute(positionAttr, i);
      
      // Only modify top vertices
      if (vertex.y > 0) {
        // Add very subtle random variation to the surface
        if (Math.random() > 0.7) {
          vertex.y += Math.random() * 0.05;
        }
        
        // CRITICAL: Drastically shrink the front part of the island (positive Z)
        // This is the part visible to the camera
        if (vertex.z > 0) {
          // Scale Z coordinate to only 20% of original (80% reduction)
          vertex.z = vertex.z * 0.2;
        }
        
        // Taper edges
        const distanceFromCenter = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
        const maxDistance = 3.5;
        if (distanceFromCenter > 2.5) {
          const falloff = (distanceFromCenter - 2.5) / (maxDistance - 2.5);
          vertex.y -= falloff * 0.2;
        }
        
        // Round corners by pushing in diagonal vertices
        if (Math.abs(vertex.x) > 2.5 && Math.abs(vertex.z) > 2.5) {
          const cornerFalloff = 0.2;
          if (vertex.x > 0) vertex.x -= cornerFalloff;
          if (vertex.x < 0) vertex.x += cornerFalloff;
          if (vertex.z > 0) vertex.z -= cornerFalloff;
          if (vertex.z < 0) vertex.z += cornerFalloff;
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