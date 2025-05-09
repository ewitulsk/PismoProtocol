"use client";
// import React from "react"; // React is implicitly imported in Next.js 13+
import React, { useState, useEffect } from "react"; // Explicitly import useState and useEffect
import Layout from "../common/Layout";
import ChartContainer from "./ChartContainer";
import AccountHealth from "./AccountHealth";
import ActionTabs from "./ActionTabs";
import CurrentPositions from "./CurrentPositions";
import "./trading-styles.css";
import { SelectableMarketAsset } from "./AssetSelector"; // Import from AssetSelector
import { PRICE_FEED_TO_INFO_MAP } from "../../config/priceFeedMapping"; // Import the map

// Imports for account object fetching (moved from ActionTabs)
import {
    useCurrentAccount,
    useSuiClientQuery,
    useSuiClient,
    useCurrentWallet,
} from "@mysten/dapp-kit";
import { PaginatedObjectsResponse, SuiObjectData, SuiClient, getFullnodeUrl, SuiObjectResponse } from '@mysten/sui/client';
import { bytesToHex } from '@noble/hashes/utils'; // For converting price_feed_id_bytes

// Constants moved from ActionTabs (only those needed for accountObjectId fetching)
const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const PROGRAM_OBJECT_ID = process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID;
const ACCOUNT_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::accounts::Account` : undefined;
const PROGRAM_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::programs::Program` : undefined;
const PUBLIC_NETWORK_NAME = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as 'testnet' | 'devnet' | 'mainnet' | 'localnet'; 
interface TokenIdentifier {
    token_info: string;
    token_decimals: number;
    price_feed_id_bytes: number[];
    oracle_feed: number;
    deprecated: boolean;
}

// New interface for the wrapper object if RPC returns {type, fields} for each TokenIdentifier in a vector
interface TokenIdentifierWrapper {
    type: string;
    fields: TokenIdentifier;
}

// Define the structure of the Program object based on your Move struct
interface ProgramObjectDataFields {
    id: { id: string }; // UID
    supported_collateral: TokenIdentifierWrapper[];
    shared_price_decimals: number; // u8
    supported_positions: TokenIdentifierWrapper[];
    max_leverage: number[]; // vector<u16>
}

// Create a read-only SuiClient for fetching public program data
let readOnlySuiClient: SuiClient;
try {
    readOnlySuiClient = new SuiClient({ url: getFullnodeUrl(PUBLIC_NETWORK_NAME) });
} catch (e) {
    console.error("Failed to create readOnlySuiClient:", e);
    // Fallback or handle error appropriately - maybe use a default client if DAppKit provides one without wallet
}

const TradingPlatform: React.FC = () => {
  // State for accountObjectId (moved from ActionTabs)
  const [accountObjectId, setAccountObjectId] = useState<string | null>(null);
  // isLoadingAccountObject will now directly reflect the query's loading state or if the account is missing.
  const [isLoadingAccountObject, setIsLoadingAccountObject] = useState<boolean>(true);

  // State for market assets
  const [availableAssets, setAvailableAssets] = useState<SelectableMarketAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<SelectableMarketAsset | null>(null);
  const [isLoadingProgram, setIsLoadingProgram] = useState<boolean>(true);
  const [programError, setProgramError] = useState<string | null>(null);

  // Hooks for account object fetching (moved from ActionTabs)
  const account = useCurrentAccount();
  const { 
    connectionStatus, 
    currentWallet 
  } = useCurrentWallet();

  // Log environment variables and network status
  useEffect(() => {
    console.log("[TradingPlatform] Initializing with:");
    console.log("  Wallet Connection Status:", connectionStatus);
    console.log("  Current Wallet Name:", currentWallet?.name);
    console.log("  Public Network for Program Data (NEXT_PUBLIC_NETWORK):", PUBLIC_NETWORK_NAME);
    try {
        const rpcUrl = getFullnodeUrl(PUBLIC_NETWORK_NAME);
        console.log("  ReadOnly SuiClient RPC Endpoint (for Program object):", rpcUrl);
    } catch (e) {
        console.log("  ReadOnly SuiClient RPC Endpoint (for Program object): Error getting URL - ", e);
    }
    console.log("  PACKAGE_ID:", PACKAGE_ID);
    console.log("  PROGRAM_OBJECT_ID (from env):", process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID);
    console.log("  Effective PROGRAM_OBJECT_ID used in query:", PROGRAM_OBJECT_ID);
    console.log("  Effective PROGRAM_TYPE used in query:", PROGRAM_TYPE);
  }, [connectionStatus, currentWallet]);

  // Fetch Account object (wallet-dependent)
  const { data: ownedAccountObject, isLoading: isLoadingOwnedAccountObjectQuery } = useSuiClientQuery(
    'getOwnedObjects',
    {
        owner: account?.address || '',
        filter: ACCOUNT_TYPE ? { StructType: ACCOUNT_TYPE } : { MatchNone: [] },
        options: { showType: true, showContent: false, showOwner: false, showPreviousTransaction: false, showStorageRebate: false, showDisplay: false },
    },
    {
      enabled: connectionStatus === 'connected' && !!account && !!ACCOUNT_TYPE,
      refetchInterval: 5000,
      select: (data: PaginatedObjectsResponse) => {
        if (data?.data && data.data.length > 0) {
            const accountObj = data.data.find(obj => obj.data?.objectId);
            return accountObj?.data?.objectId ?? null;
        }
        return null;
      },
    }
  );

  useEffect(() => {
    if (connectionStatus !== 'connected' || !account) {
      setAccountObjectId(null);
      setIsLoadingAccountObject(true); 
      return;
    }
    setIsLoadingAccountObject(isLoadingOwnedAccountObjectQuery);
    if (!isLoadingOwnedAccountObjectQuery) {
      const newAccountId = ownedAccountObject ?? null;
      if (newAccountId !== accountObjectId) {
        console.log("[TradingPlatform] Setting accountObjectId:", newAccountId);
        setAccountObjectId(newAccountId);
      }
    }
  }, [account, connectionStatus, ownedAccountObject, isLoadingOwnedAccountObjectQuery, accountObjectId]);

  // Fetch the Program object using the read-only client
  useEffect(() => {
    if (!PROGRAM_OBJECT_ID || !PROGRAM_TYPE || !readOnlySuiClient) {
      setProgramError("Program configuration or read-only client not available.");
      setIsLoadingProgram(false);
      return;
    }

    let isMounted = true;
    setIsLoadingProgram(true);
    setProgramError(null);

    readOnlySuiClient.getObject({
      id: PROGRAM_OBJECT_ID,
      options: { showContent: true, showType: true },
    }).then((response: SuiObjectResponse) => {
      if (!isMounted) return;

      if (response.error) {
        let errorMessage = "Unknown RPC error";
        if (response.error.code === 'notExists') {
          errorMessage = `Object ${response.error.object_id} not found on ${PUBLIC_NETWORK_NAME}.`;
        } else if (response.error.code === 'displayError' && response.error.error) {
            errorMessage = response.error.error; // Use the 'error' field for displayError
        } else if (typeof (response.error as any).message === 'string') { // Fallback for other errors that might have a message
          errorMessage = (response.error as any).message;
        } else if (response.error.code) {
            errorMessage = `RPC error code: ${response.error.code}`;
        }
        console.error("[TradingPlatform] Error fetching Program object (readOnlyClient):", response.error);
        setProgramError(`Failed to load market configurations: ${errorMessage}`);
        setAvailableAssets([]);
        setSelectedAsset(null);
        return; 
      }

      if (response.data && response.data.content && response.data.content.dataType === 'moveObject') {
        const moveObject = response.data.content;
        if (moveObject.type === PROGRAM_TYPE) {
          const fields = moveObject.fields as unknown as ProgramObjectDataFields; 
          console.log("[TradingPlatform] Program object fetched (readOnlyClient):", JSON.stringify(fields, null, 2));
          console.log("[TradingPlatform] Detailed supported_positions (pre-map):", JSON.stringify(fields.supported_positions, null, 2));

          if (!fields.supported_positions || !Array.isArray(fields.supported_positions)) {
            console.error("[TradingPlatform] fields.supported_positions is not an array or is undefined.");
            setProgramError("Market configuration has invalid supported_positions.");
            setAvailableAssets([]);
            setSelectedAsset(null);
          } else {
            const assets: SelectableMarketAsset[] = fields.supported_positions.map((tokenWrapper: TokenIdentifierWrapper, index) => {
              console.log(`[TradingPlatform] Processing tokenWrapper at index ${index}:`, JSON.stringify(tokenWrapper)); 

              if (!tokenWrapper || typeof tokenWrapper.fields !== 'object' || tokenWrapper.fields === null) {
                console.warn(`[TradingPlatform] tokenWrapper at index ${index} is invalid or missing .fields:`, tokenWrapper);
                return { id: `invalid-wrapper-${index}`, displayName: `Invalid Wrapper ${index + 1}`, baseAsset: "INV", priceFeedId: "INV", aggregatorSymbol: "INV", marketIndex: index }; 
              }
              
              // tokenIdentifierFields now refers to the actual fields of the TokenIdentifier struct
              const tokenIdentifierFields = tokenWrapper.fields; 

              if (!Array.isArray(tokenIdentifierFields.price_feed_id_bytes)) {
                console.warn(`[TradingPlatform] Token at index ${index} has invalid price_feed_id_bytes:`, tokenIdentifierFields.price_feed_id_bytes, "Full wrapper:", JSON.stringify(tokenWrapper));
                return { id: `invalid-bytes-${index}`, displayName: `Invalid Market Bytes ${index + 1}`, baseAsset: "ERR", priceFeedId: "ERR", aggregatorSymbol: "ERR", marketIndex: index };
              }
              
              let priceFeedIdHex;
              try {
                if (!tokenIdentifierFields.price_feed_id_bytes.every(item => typeof item === 'number')) {
                    throw new Error('price_feed_id_bytes contains non-numeric elements');
                }
                priceFeedIdHex = "0x" + bytesToHex(Uint8Array.from(tokenIdentifierFields.price_feed_id_bytes));
                console.log(`[TradingPlatform] Token index ${index}, price_feed_id_bytes processed. Generated priceFeedIdHex:`, priceFeedIdHex);
              } catch (e: any) {
                console.error(`[TradingPlatform] Error converting price_feed_id_bytes for token at index ${index}:`, e.message, "Full wrapper:", JSON.stringify(tokenWrapper));
                return { id: `conversion-error-${index}`, displayName: `Conversion Error ${index + 1}`, baseAsset: "CONV_ERR", priceFeedId: "CONV_ERR", aggregatorSymbol: "CONV_ERR", marketIndex: index };
              }

              const tokenDecimals = typeof tokenIdentifierFields.token_decimals === 'number' ? tokenIdentifierFields.token_decimals : 0; 
              console.log(`[TradingPlatform] Token index ${index}, tokenIdentifierFields.token_decimals:`, tokenIdentifierFields.token_decimals, "=> Used as:", tokenDecimals);

              const marketInfoFromMap = PRICE_FEED_TO_INFO_MAP[priceFeedIdHex];
              const marketInfo = marketInfoFromMap || 
                                 { 
                                   displayName: `Unknown (${priceFeedIdHex.slice(0, 10)}...)`,
                                   baseAsset: "N/A", 
                                   defaultDecimals: tokenDecimals 
                                 };
              console.log(`[TradingPlatform] Token index ${index}, marketInfo resolved:`, JSON.stringify(marketInfo));

              const selectableAsset: SelectableMarketAsset = {
                id: priceFeedIdHex,
                displayName: marketInfo.displayName,
                baseAsset: marketInfo.baseAsset,
                priceFeedId: priceFeedIdHex,
                marketIndex: index,
              };

              if (marketInfoFromMap && typeof (marketInfoFromMap as any).change24h === 'number') {
                selectableAsset.change24h = (marketInfoFromMap as any).change24h;
              }

              return selectableAsset;
            }).filter(asset => asset && !asset.id.startsWith('invalid-') && !asset.id.startsWith('error-') && !asset.id.startsWith('conversion-error-'));
            
            console.log("[TradingPlatform] Processed assets:", JSON.stringify(assets));
            setAvailableAssets(assets);
            if (assets.length > 0 && !selectedAsset) {
              setSelectedAsset(assets[0]);
            }
            setProgramError(null);
          }
        } else {
          // Object is a Move object, but not the type we expected
          const msg = `Program object (${PROGRAM_OBJECT_ID}) on ${PUBLIC_NETWORK_NAME} has unexpected type. Expected: ${PROGRAM_TYPE}, Got: ${moveObject.type}`;
          console.warn("[TradingPlatform] " + msg);
          setProgramError(msg);
          setAvailableAssets([]);
          setSelectedAsset(null);
        }
      } else {
        // Object not found, or content is not a Move object (e.g., it's a package or raw data)
        const dataTypeReceived = response.data?.content?.dataType;
        const msg = `Program object (${PROGRAM_OBJECT_ID}) not found on ${PUBLIC_NETWORK_NAME} or is not a Move object. Received data type: ${dataTypeReceived || 'N/A'}`;
        console.warn("[TradingPlatform] " + msg);
        setProgramError(msg);
        setAvailableAssets([]);
        setSelectedAsset(null);
      }
    }).catch(error => {
      if (!isMounted) return;
      console.error("[TradingPlatform] Exception fetching Program object (readOnlyClient):", error);
      const message = error instanceof Error ? error.message : String(error);
      setProgramError(`Exception loading market configurations: ${message}`);
    }).finally(() => {
      if (isMounted) {
        setIsLoadingProgram(false);
      }
    });

    return () => { isMounted = false; };
  }, [selectedAsset]); // PUBLIC_NETWORK_NAME, PROGRAM_OBJECT_ID, PROGRAM_TYPE are stable after init

  const handleAssetSelect = (asset: SelectableMarketAsset) => {
    setSelectedAsset(asset);
    console.log("[TradingPlatform] New asset selected:", asset);
  };

  if (isLoadingProgram && availableAssets.length === 0) {
    return (
        <Layout activePage="trading">
            <div className="flex flex-col h-full items-center justify-center">
                <p className="text-xl text-primary">Loading trading markets...</p>
                {/* You could add a spinner component here */}
            </div>
        </Layout>
    );
  }

  if (programError) {
    return (
        <Layout activePage="trading">
            <div className="flex flex-col h-full items-center justify-center p-8 text-center">
                <p className="text-xl text-red-500">Error Loading Trading Platform</p>
                <p className="text-md text-gray-400 mt-2">{programError}</p>
                <p className="text-sm text-gray-500 mt-4">
                    Please ensure your environment variables (NEXT_PUBLIC_SUI_PACKAGE_ID, NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID) are correctly set and the Program object is published on-chain.
                </p>
            </div>
        </Layout>
    );
  }

  if (!selectedAsset || availableAssets.length === 0) {
     return (
        <Layout activePage="trading">
            <div className="flex flex-col h-full items-center justify-center">
                <p className="text-xl text-primary">No tradable markets available.</p>
                <p className="text-md text-gray-400 mt-2">
                    This might be a configuration issue with the smart contract.
                </p>
            </div>
        </Layout>
    );
  }

  return (
    <Layout activePage="trading">
      <div className="flex flex-col h-full overflow-y-auto">
        <section className="trading-layout flex-grow p-4 md:p-6 lg:p-8">
          <div className="trading-container grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="trading-chart-wrapper lg:col-span-2 bg-backgroundOffset rounded-lg shadow-xl min-h-[400px] md:min-h-[500px]">
              <ChartContainer 
                selectedAsset={selectedAsset} 
                availableAssets={availableAssets} 
                onAssetSelect={handleAssetSelect} 
              />
            </div>
            <aside className="trading-sidebar lg:col-span-1 flex flex-col gap-4">
              <AccountHealth percentage={85} />
              <ActionTabs
                account={account}
                accountObjectId={accountObjectId}
                isLoadingAccount={isLoadingAccountObject}
                selectedMarketIndex={selectedAsset?.marketIndex}
                selectedMarketPriceFeedId={selectedAsset?.priceFeedId}
              />
            </aside>
          </div>
          <CurrentPositions accountId={accountObjectId} />
        </section>
      </div>
    </Layout>
  );
};

export default TradingPlatform;