import DeFiApp from '@/components/vault/DeFiApp';
// Update import path for VaultData
import { VaultData } from '@/types'; // Assuming you have a type definition for the vault data

// Define the expected structure of the API response
interface VaultApiResponse {
  totalValueLocked: number;
  vaults: VaultData[]; // Use the imported VaultData type
  count: number;
}

async function getVaultData(): Promise<VaultData[]> {
  try {
    // Replace with your actual backend API endpoint URL
    // Consider using an environment variable for the base URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://172.24.219.19:5000/'; // Example URL
    const response = await fetch(`${backendUrl}/api/calculateTotalValueLocked`, {
      method: 'POST', // Change to POST
      headers: {
        'Content-Type': 'application/json', // Set content type for JSON
      },
      body: JSON.stringify({}), // Add any required payload here
      // Add cache control if needed, e.g., revalidate data periodically
      next: { revalidate: 30 } // Revalidate every 30 seconds
    });

    if (!response.ok) {
      console.error(`Error fetching vault data: ${response.statusText}`);
      return []; // Return empty array on error
    }

    const data: VaultApiResponse = await response.json();
    console.log(data.vaults)
    return data.vaults || []; // Return the vaults array or empty array if missing
  } catch (error) {
    console.error('Failed to fetch vault data:', error);
    return []; // Return empty array on exception
  }
}

// Make the page component async to fetch data
export default async function VaultPage() {
  const vaults = await getVaultData();

  // Pass the fetched vaults data to the DeFiApp component
  return <DeFiApp initialVaults={vaults} />;
}