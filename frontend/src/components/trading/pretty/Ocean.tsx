"use client";
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OceanProps {
  position?: [number, number, number];
}

export default function Ocean({ position = [0, 0, 0] }: OceanProps) {
  const oceanRef = useRef<THREE.Group>(null);
  const waveRefs = useRef<THREE.Mesh[]>([]);
  
  // Create multiple overlapping wave layers for a more dynamic look
  const waveCount = 5;
  const waveColors = useMemo(() => [
    "#0a5eb3", // Darker blue
    "#1267ba", // Medium dark blue
    "#1a70c2", // Medium blue
    "#267ccc", // Lighter blue
    "#3088d4"  // Lightest blue
  ], []);
  
  // Create wave geometries with varying parameters
  const waveGeometries = useMemo(() => {
    return Array(waveCount).fill(0).map((_, i) => {
      // Different size and segment count for each wave
      const radius = 20 + i * 0.8; // Larger waves
      const segments = 32 + i * 2;
      
      // Create a circular plane with some random height variations
      const geometry = new THREE.CircleGeometry(radius, segments);
      const positionAttr = geometry.getAttribute('position');
      const vertex = new THREE.Vector3();
      
      // Add height variations
      for (let j = 0; j < positionAttr.count; j++) {
        vertex.fromBufferAttribute(positionAttr, j);
        
        // Skip the center vertex
        if (vertex.x !== 0 || vertex.z !== 0) {
          // Distance from center
          const dist = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
          
          // Add some subtle random height variations
          vertex.y = Math.sin(dist * 0.5) * 0.05;
        }
        
        positionAttr.setXYZ(j, vertex.x, vertex.y, vertex.z);
      }
      
      geometry.computeVertexNormals();
      return geometry;
    });
  }, [waveCount]);
  
  // Animate the waves
  useFrame((state) => {
    if (!oceanRef.current) return;
    
    // Animate each wave layer
    waveRefs.current.forEach((waveMesh, index) => {
      if (!waveMesh) return;
      
      // Get position attribute
      const positionAttr = waveMesh.geometry.getAttribute('position');
      const vertex = new THREE.Vector3();
      
      // Animate using time and position
      const time = state.clock.getElapsedTime();
      const waveSpeed = 0.3 + index * 0.1;
      const waveHeight = 0.05 - index * 0.005;
      
      for (let i = 0; i < positionAttr.count; i++) {
        vertex.fromBufferAttribute(positionAttr, i);
        
        // Skip the center vertex
        if (vertex.x !== 0 || vertex.z !== 0) {
          // Distance from center
          const dist = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
          
          // Different wave patterns based on angle and distance
          const angle = Math.atan2(vertex.z, vertex.x);
          
          // Create wave animation using sine waves
          vertex.y = Math.sin(dist * 0.5 + time * waveSpeed) * waveHeight;
          
          // Add secondary wave pattern
          vertex.y += Math.sin(angle * 3 + time * 0.7) * waveHeight * 0.3;
        }
        
        positionAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      
      positionAttr.needsUpdate = true;
    });
  });
  
  return (
    <group ref={oceanRef} position={position}>
      {/* Create multiple overlapping wave layers */}
      {waveGeometries.map((geometry, index) => (
        <mesh 
          key={index}
          ref={(el) => { if (el) waveRefs.current[index] = el }}
          position={[0, -0.1 - index * 0.05, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <primitive object={geometry} attach="geometry" />
          <meshStandardMaterial
            color={waveColors[index]}
            transparent={true}
            opacity={0.9 - index * 0.1}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}