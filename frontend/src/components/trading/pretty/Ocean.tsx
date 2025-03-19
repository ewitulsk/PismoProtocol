"use client";
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OceanProps {
  position?: [number, number, number];
}

export default function Ocean({ position = [0, 0, 0] }: OceanProps) {
  const oceanRef = useRef<THREE.Group>(null);
  const waveRowsRef = useRef<THREE.Mesh[]>([]);
  
  // Ocean colors - from darker (far) to lighter (near)
  const oceanColors = useMemo(() => [
    "#0a5eb3", // Darkest blue (farthest)
    "#1267ba", 
    "#1a70c2", 
    "#267ccc", 
    "#3088d4"  // Lightest blue (closest)
  ], []);
  
  // Create triangular wave rows
  const waveRows = useMemo(() => {
    const rows = [];
    const rowCount = 8; // Number of wave rows
    const width = 30; // Width of the ocean
    const depth = 20; // Depth of the ocean (from far to near)
    const rowDepth = depth / rowCount; // Depth of each row
    
    for (let i = 0; i < rowCount; i++) {
      // Create a row of triangles
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const triangleCount = 12; // Number of triangles per row
      const triangleWidth = width / triangleCount;
      
      // Alternate the pattern for each row to create a wave effect
      const isEvenRow = i % 2 === 0;
      const zFar = -depth/2 + i * rowDepth; // Far edge of this row
      const zNear = zFar + rowDepth; // Near edge of this row
      const yOffset = Math.sin(i * 0.7) * 0.1; // Slight height variation between rows
      
      // Create triangles across the row
      for (let j = 0; j < triangleCount; j++) {
        const xLeft = -width/2 + j * triangleWidth;
        const xRight = xLeft + triangleWidth;
        const xMid = (xLeft + xRight) / 2;
        
        // Alternate triangle orientation based on position
        const isEvenTriangle = j % 2 === 0;
        const shouldPointUp = (isEvenRow && isEvenTriangle) || (!isEvenRow && !isEvenTriangle);
        
        if (shouldPointUp) {
          // Triangle pointing up
          vertices.push(
            // Left bottom
            xLeft, yOffset - 0.05, zFar,
            // Right bottom
            xRight, yOffset - 0.05, zFar,
            // Middle top
            xMid, yOffset + 0.15, zNear
          );
        } else {
          // Triangle pointing down
          vertices.push(
            // Left top
            xLeft, yOffset + 0.15, zNear,
            // Right top
            xRight, yOffset + 0.15, zNear,
            // Middle bottom
            xMid, yOffset - 0.05, zFar
          );
        }
      }
      
      // Create the buffer geometry
      const verticesArray = new Float32Array(vertices);
      geometry.setAttribute('position', new THREE.BufferAttribute(verticesArray, 3));
      geometry.computeVertexNormals();
      
      // Determine color based on row position
      const colorIndex = Math.min(Math.floor(i / rowCount * oceanColors.length), oceanColors.length - 1);
      
      rows.push({
        geometry,
        position: [0, 0, 0] as [number, number, number],
        color: oceanColors[colorIndex],
        opacity: 0.9 - (i / rowCount) * 0.3 // Farther rows are slightly more transparent
      });
    }
    
    return rows;
  }, [oceanColors]);
  
  // Animate the waves
  useFrame((state) => {
    if (!oceanRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    // Animate each wave row
    waveRowsRef.current.forEach((waveMesh, index) => {
      if (!waveMesh) return;
      
      // Gentle bobbing motion
      waveMesh.position.y = Math.sin(time * 0.5 + index * 0.2) * 0.05;
      
      // Subtle rotation
      waveMesh.rotation.x = Math.sin(time * 0.3 + index * 0.1) * 0.02;
    });
  });
  
  return (
    <group ref={oceanRef} position={position} rotation={[-Math.PI / 12, 0, 0]}>
      {/* Render all wave rows */}
      {waveRows.map((row, index) => (
        <mesh 
          key={index}
          ref={(el) => { if (el) waveRowsRef.current[index] = el }}
          position={row.position}
        >
          <primitive object={row.geometry} attach="geometry" />
          <meshStandardMaterial
            color={row.color}
            transparent={true}
            opacity={row.opacity}
            roughness={0.4}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}