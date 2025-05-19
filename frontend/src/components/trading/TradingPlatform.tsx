"use client";
import React, { useState, useEffect, useRef } from "react"; 
import Layout from "../common/Layout";
import ChartContainer from "./ChartContainer";
import AccountHealth from "./AccountHealth";
import ActionTabs from "./ActionTabs";
import CurrentPositions from "./CurrentPositions";
import "./trading-styles.css";
import { SelectableMarketAsset } from "./AssetSelector"; 
import { PRICE_FEED_TO_INFO_MAP } from "../../config/priceFeedMapping";
import { pythPriceFeedService } from '@/utils/pythPriceFeed';

import {
    useCurrentAccount,
    useSuiClientQuery,
    useSuiClient,
    useCurrentWallet,
} from "@mysten/dapp-kit";
import { PaginatedObjectsResponse, SuiObjectData, SuiClient, getFullnodeUrl, SuiObjectResponse } from '@mysten/sui/client';
import { bytesToHex } from '@noble/hashes/utils'; // For converting price_feed_id_bytes
import type { MinimalAccountInfo, SupportedCollateralToken as ExtSupportedCollateralToken, NotificationState as ExtNotificationState } from '../../lib/transactions/depositCollateral'; // Added for supportedCollateral type

const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const PROGRAM_OBJECT_ID = process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID;
const ACCOUNT_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::accounts::Account` : undefined;
const PROGRAM_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::programs::Program` : undefined;
const PUBLIC_NETWORK_NAME = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as 'testnet' | 'devnet' | 'mainnet' | 'localnet'; 
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL; // Added for fetching accountStatsId
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL; // Added for fetching supportedCollateral

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

// Type matching the indexer /v0/:account_id/collateral/:token_info response
type DepositedCollateralResponse = {
    collateral_id: number[]; // Assuming bytes represented as number array in JSON
    collateral_marker_id: number[];
    account_id: number[];
    token_id: {
        account_address: number[];
        creation_num: number; // Backend returns u64, comes as number in JSON (potential precision loss for > 2^53)
    };
    amount: number; // Backend returns u64, comes as number in JSON (potential precision loss for > 2^53) - MUST TREAT AS BIGINT
};

// Create a read-only SuiClient for fetching public program data
let readOnlySuiClient: SuiClient;
try {
    readOnlySuiClient = new SuiClient({ url: getFullnodeUrl(PUBLIC_NETWORK_NAME) });
} catch (e) {
    console.error("Failed to create readOnlySuiClient:", e);
    // Fallback or handle error appropriately - maybe use a default client if DAppKit provides one without wallet
}

// Type matching the backend /api/supportedCollateral response structure (from ActionTabs)
// Renaming to avoid conflict if ActionTabs also defines it, though it should be the same.
type FetchedSupportedCollateralToken = ExtSupportedCollateralToken;

// Type to store fetched collateral data along with a user-friendly name (from ActionTabs)
type CollateralInfo = FetchedSupportedCollateralToken & {
    name: string; // User-friendly name like 'SUI', 'USDC'
};

// Function to extract a readable name from the token_info type string (from ActionTabs)
const getTokenNameFromType = (typeString: string): string => {
  const parts = typeString.split('::');
  return parts[parts.length - 1] || typeString; 
};

const TradingPlatform: React.FC = () => {
  const [accountObjectId, setAccountObjectId] = useState<string | null>(null);
  const [isLoadingAccountObject, setIsLoadingAccountObject] = useState<boolean>(true); // Covers fetching accountObjectId
  
  // Added state for accountStatsId
  const [accountStatsId, setAccountStatsId] = useState<string | null>(null);
  const [isFetchingStatsId, setIsFetchingStatsId] = useState<boolean>(false); // Loading state for statsId

  // Added state for supportedCollateral
  const [supportedCollateral, setSupportedCollateral] = useState<CollateralInfo[]>([]);
  const [isLoadingCollateral, setIsLoadingCollateral] = useState(true);
  const [collateralError, setCollateralError] = useState<string | null>(null);

  // State for market assets
  const [availableAssets, setAvailableAssets] = useState<SelectableMarketAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<SelectableMarketAsset | null>(null);
  const [isLoadingProgram, setIsLoadingProgram] = useState<boolean>(true);
  const [programError, setProgramError] = useState<string | null>(null);

  // Add state for Total Position Delta (TPD)
  const [totalPositionDelta, setTotalPositionDelta] = useState<number>(0);

  // --- Collateral Value Calculation and Logging ---
  const [totalCollateralValue, setTotalCollateralValue] = useState<number>(0);
  // --- Deposited Collateral State (moved from ActionTabs) ---
  const [userDepositedCollateral, setUserDepositedCollateral] = useState<Record<string, string>>({});
  const [isLoadingDepositedCollateral, setIsLoadingDepositedCollateral] = useState(false);
  const [depositedCollateralError, setDepositedCollateralError] = useState<string | null>(null);

  const isFirstDepositedCollateralFetch = useRef(true);

  useEffect(() => {
    let cancelled = false;
    async function calculateAndLogTotalCollateralValue() {
      if (!supportedCollateral.length || !userDepositedCollateral) {
        setTotalCollateralValue(0);
        // console.log("[TradingPlatform] Total Collateral Value: 0");
        return;
      }
      let totalValue = 0;
      const pricePromises = supportedCollateral.map(async (collateral) => {
        const tokenInfo = collateral.fields.token_info;
        const amountStr = userDepositedCollateral[tokenInfo];
        if (!amountStr || amountStr === "Error") return 0;
        const amount = parseFloat(amountStr);
        if (!amount || isNaN(amount) || amount <= 0) return 0;

        let priceFeedIdHex: string | undefined = undefined;
        if (collateral.fields.price_feed_id_bytes_hex) {
          priceFeedIdHex = collateral.fields.price_feed_id_bytes_hex;
        } else if (Array.isArray(collateral.fields.price_feed_id_bytes)) {
          try {
            const bytes = Uint8Array.from(collateral.fields.price_feed_id_bytes);
            priceFeedIdHex = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
          } catch {
            priceFeedIdHex = undefined;
          }
        }
        if (!priceFeedIdHex) return 0;

        try {
          const priceData = await pythPriceFeedService.getLatestPrice(priceFeedIdHex);
          if (!priceData || typeof priceData.price !== "number" || isNaN(priceData.price)) return 0;
          return amount * priceData.price;
        } catch {
          return 0;
        }
      });

      const values = await Promise.all(pricePromises);
      if (!cancelled) {
        totalValue = values.reduce((a, b) => a + b, 0);
        setTotalCollateralValue(totalValue); // <-- Set state
        // console.log("[TradingPlatform] Total Collateral Value:", totalValue);
      }
    }
    calculateAndLogTotalCollateralValue();
    return () => { cancelled = true; };
  }, [userDepositedCollateral, supportedCollateral]);
  // --- End Collateral Value Calculation and Logging ---

  

  // Hooks for account object fetching (moved from ActionTabs)
  const currentWalletAccount = useCurrentAccount(); // Renamed from account to avoid conflict with MinimalAccountInfo state
  const [account, setAccount] = useState<MinimalAccountInfo | null>(null); // State for MinimalAccountInfo
  const { 
    connectionStatus, 
    currentWallet 
  } = useCurrentWallet();

  // Combined loading state for all critical user and protocol account details
  const isLoadingAccountDetails = !account || isLoadingAccountObject || isFetchingStatsId;

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
    // Log loading states
    console.log("[TradingPlatform] Loading states:", { isLoadingAccountObject, isFetchingStatsId, isLoadingProgram, isLoadingAccountDetails });
    console.log("[TradingPlatform] Account details:", { account, accountObjectId, accountStatsId });
  }, [connectionStatus, currentWallet, isLoadingAccountObject, isFetchingStatsId, isLoadingProgram, isLoadingAccountDetails, account, accountObjectId, accountStatsId]); // Add all relevant states to see changes

  useEffect(() => {
    if (currentWalletAccount) {
        setAccount({ 
            address: currentWalletAccount.address, 
            // Optional: chains, features, icon, label, publicKey if needed and available
            // If MinimalAccountInfo only needs address, this is simpler:
            // { address: currentWalletAccount.address }
         });
    } else {
        setAccount(null);
    }
  }, [currentWalletAccount]);

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

  // Fetch AccountStats ID when Account Object ID is known (logic from ActionTabs)
  useEffect(() => {
    if (!accountObjectId || !account) { // Ensure account (MinimalAccountInfo) is also available
        setAccountStatsId(null); 
        return;
    }
    // Avoid re-fetching if already present or in progress
    if (accountStatsId && !isFetchingStatsId) return; 

    const fetchAccountStatsId = async () => {
        console.log(`[TradingPlatform] Fetching account stats for account object ID: ${accountObjectId}`);
        setIsFetchingStatsId(true);
        try {
            const accountIdForUrl = accountObjectId.startsWith('0x')
                ? accountObjectId.substring(2)
                : accountObjectId;
            const response = await fetch(`${INDEXER_URL}/v0/accounts/${accountIdForUrl}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                 throw new Error(errorData.error || `Failed to fetch account stats: ${response.status}`);
            }
            const data = await response.json();
            if (data && typeof data.stats_id === 'string' && data.stats_id) {
                const statsIdWithPrefix = data.stats_id.startsWith('0x') ? data.stats_id : '0x' + data.stats_id;
                setAccountStatsId(statsIdWithPrefix);
                console.log("[TradingPlatform] AccountStatsId set to:", statsIdWithPrefix);
            } else {
                 console.error("[TradingPlatform] Account stats ID not found or invalid in response:", data);
                 setAccountStatsId(null); // Explicitly set to null
                 // throw new Error("Account stats ID not found or invalid in response."); // Optional: throw to show error to user
            }
        } catch (error) {
            console.error('[TradingPlatform] Error fetching account stats ID:', error);
            setAccountStatsId(null);
        } finally {
            setIsFetchingStatsId(false);
        }
    };
    fetchAccountStatsId();
  }, [accountObjectId, account, accountStatsId, isFetchingStatsId]); // Added dependencies

  // Fetch the Program object using the read-only client
  useEffect(() => {
    if (!PROGRAM_OBJECT_ID || !PROGRAM_TYPE || !readOnlySuiClient) {
      setProgramError("Program configuration or read-only client not available.");
      setIsLoadingProgram(false);
      setSupportedCollateral([]); // Clear on error
      return;
    }

    let isMounted = true;
    setIsLoadingProgram(true);
    setProgramError(null);
    setAvailableAssets([]); // Clear previous assets
    setSelectedAsset(null); // Clear selected asset
    setSupportedCollateral([]); // Clear previous supported collateral

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
            errorMessage = response.error.error; 
        } else if (typeof (response.error as any).message === 'string') { 
          errorMessage = (response.error as any).message;
        } else if (response.error.code) {
            errorMessage = `RPC error code: ${response.error.code}`;
        }
        console.error("[TradingPlatform] Error fetching Program object (readOnlyClient):", response.error);
        setProgramError(`Failed to load market configurations: ${errorMessage}`);
        setAvailableAssets([]);
        setSelectedAsset(null);
        setSupportedCollateral([]); // Clear on error
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
            setSupportedCollateral([]); // Clear on error
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
                decimals: tokenDecimals,
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
          }

          // Process supported_collateral (NEW LOGIC)
          if (!fields.supported_collateral || !Array.isArray(fields.supported_collateral)) {
            console.error("[TradingPlatform] fields.supported_collateral is not an array or is undefined.");
            // Optionally set a specific error or warning if collateral is critical and missing
            // setProgramError("Market configuration has invalid supported_collateral."); 
            setSupportedCollateral([]); // Ensure it's an empty array if invalid
          } else {
            const processedCollateral: CollateralInfo[] = fields.supported_collateral.map((tokenWrapper: TokenIdentifierWrapper, index) => {
              console.log(`[TradingPlatform] Processing supported_collateral tokenWrapper at index ${index}:`, JSON.stringify(tokenWrapper));
              if (!tokenWrapper || typeof tokenWrapper.fields !== 'object' || tokenWrapper.fields === null) {
                console.warn(`[TradingPlatform] supported_collateral tokenWrapper at index ${index} is invalid or missing .fields:`, tokenWrapper);
                // Return a shape that can be filtered out or handled, or skip
                return null;
              }
              const tokenIdentifierFields = tokenWrapper.fields;
              if (!Array.isArray(tokenIdentifierFields.price_feed_id_bytes)) {
                console.warn(`[TradingPlatform] supported_collateral Token at index ${index} has invalid price_feed_id_bytes:`, tokenIdentifierFields.price_feed_id_bytes);
                return null;
              }
              let priceFeedIdHex;
              try {
                if (!tokenIdentifierFields.price_feed_id_bytes.every(item => typeof item === 'number')) {
                    throw new Error('price_feed_id_bytes contains non-numeric elements for collateral');
                }
                priceFeedIdHex = "0x" + bytesToHex(Uint8Array.from(tokenIdentifierFields.price_feed_id_bytes));
              } catch (e: any) {
                console.error(`[TradingPlatform] Error converting price_feed_id_bytes for supported_collateral at index ${index}:`, e.message);
                return null;
              }
              
              // Normalize token_info to ensure 0x prefix for addresses
              let normalizedTokenInfo = tokenIdentifierFields.token_info;
              const parts = normalizedTokenInfo.split('::');
              if (parts.length > 1 && /^[0-9a-fA-F]+$/.test(parts[0]) && !parts[0].startsWith('0x')) {
                  parts[0] = '0x' + parts[0];
                  normalizedTokenInfo = parts.join('::');
                  console.log(`[TradingPlatform] Normalized token_info for collateral from "${tokenIdentifierFields.token_info}" to "${normalizedTokenInfo}"`);
              }

              // Construct the CollateralInfo object
              // Note: ExtSupportedCollateralToken has 'fields.token_info', 'fields.token_decimals', etc.
              // The CollateralInfo adds a 'name'.
              const collateralEntry: CollateralInfo = {
                type: tokenWrapper.type, // Store the full type if needed, e.g., for matching with ActionTabs
                fields: {
                    token_info: normalizedTokenInfo, // Use normalized string
                    token_decimals: typeof tokenIdentifierFields.token_decimals === 'number' ? tokenIdentifierFields.token_decimals : 0,
                    price_feed_id_bytes: tokenIdentifierFields.price_feed_id_bytes, // Keep original bytes if needed by other parts
                    price_feed_id_bytes_hex: priceFeedIdHex, // Add the hex version
                    oracle_feed: tokenIdentifierFields.oracle_feed,
                    deprecated: tokenIdentifierFields.deprecated,
                },
                name: getTokenNameFromType(normalizedTokenInfo) // Use normalized string for name generation too
              };
              return collateralEntry;
            }).filter(Boolean) as CollateralInfo[]; // Filter out any nulls from mapping invalid entries
            
            console.log("[TradingPlatform] Processed supported_collateral:", JSON.stringify(processedCollateral));
            setSupportedCollateral(processedCollateral);
          }
          setProgramError(null); // Clear general program error if both positions and collateral are processed (even if one is empty due to specific issues)

        } else {
          // Object is a Move object, but not the type we expected
          const msg = `Program object (${PROGRAM_OBJECT_ID}) on ${PUBLIC_NETWORK_NAME} has unexpected type. Expected: ${PROGRAM_TYPE}, Got: ${moveObject.type}`;
          console.warn("[TradingPlatform] " + msg);
          setProgramError(msg);
          setAvailableAssets([]);
          setSelectedAsset(null);
          setSupportedCollateral([]); // Clear on error
        }
      } else {
        // Object not found, or content is not a Move object (e.g., it's a package or raw data)
        const dataTypeReceived = response.data?.content?.dataType;
        const msg = `Program object (${PROGRAM_OBJECT_ID}) not found on ${PUBLIC_NETWORK_NAME} or is not a Move object. Received data type: ${dataTypeReceived || 'N/A'}`;
        console.warn("[TradingPlatform] " + msg);
        setProgramError(msg);
        setAvailableAssets([]);
        setSelectedAsset(null);
        setSupportedCollateral([]); // Clear on error
      }
    }).catch(error => {
      if (!isMounted) return;
      console.error("[TradingPlatform] Exception fetching Program object (readOnlyClient):", error);
      const message = error instanceof Error ? error.message : String(error);
      setProgramError(`Exception loading market configurations: ${message}`);
      setSupportedCollateral([]); // Clear on error
    }).finally(() => {
      if (isMounted) {
        setIsLoadingProgram(false);
      }
    });

    return () => { isMounted = false; };
  }, []); // Changed dependency array to [] to fetch once on mount

  // Fetch deposited collateral for all supported collateral tokens
  useEffect(() => {
    if (!accountObjectId || supportedCollateral.length === 0 || !INDEXER_URL) {
      setUserDepositedCollateral({});
      setIsLoadingDepositedCollateral(false);
      isFirstDepositedCollateralFetch.current = true; // Reset on dependency change
      return;
    }
    let cancelled = false;
    const fetchAllDepositedCollateral = async () => {
      if (isFirstDepositedCollateralFetch.current) setIsLoadingDepositedCollateral(true);
      let fetchErrorOccurred = false;
      const accountIdForUrl = accountObjectId.startsWith('0x') ? accountObjectId.substring(2) : accountObjectId;

      // Use Promise.all to fetch all collateral in parallel
      const fetchPromises = supportedCollateral.map(async (token) => {
        const tokenInfo = token.fields.token_info;
        const decimals = token.fields.token_decimals;
        const tokenInfoForUrl = tokenInfo.startsWith('0x') ? tokenInfo.substring(2) : tokenInfo;
        const encodedTokenInfo = encodeURIComponent(tokenInfoForUrl);
        const url = `${INDEXER_URL}/v0/${accountIdForUrl}/collateral/${encodedTokenInfo}`;
        try {
          const response = await fetch(url);
          if (!response.ok) {
            if (response.status === 404) {
              return [tokenInfo, "0.0"];
            }
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `Failed to fetch deposited collateral for ${token.name}: ${response.status}`);
          }
          const data: DepositedCollateralResponse[] = await response.json();
          let totalDepositedAmount = BigInt(0);
          if (Array.isArray(data)) {
            data.forEach((deposit: DepositedCollateralResponse) => { totalDepositedAmount += BigInt(String(deposit.amount)); });
          }
          const formatted = (() => {
            try {
              if (typeof totalDepositedAmount === "bigint" && typeof decimals === "number") {
                return (Number(totalDepositedAmount) / Math.pow(10, decimals)).toString();
              }
              return totalDepositedAmount.toString();
            } catch {
              return totalDepositedAmount.toString();
            }
          })();
          return [tokenInfo, formatted];
        } catch (error) {
          console.error(`Error fetching deposited collateral for ${token.name}:`, error);
          fetchErrorOccurred = true;
          return [tokenInfo, "Error"];
        }
      });

      const results = await Promise.all(fetchPromises);
      const newDepositedBalances: Record<string, string> = {};
      results.forEach(([tokenInfo, value]) => {
        newDepositedBalances[tokenInfo] = value;
      });

      if (!cancelled) {
        setUserDepositedCollateral(newDepositedBalances);
        if (fetchErrorOccurred) {
          setDepositedCollateralError("Error fetching some deposited collateral balances. Check console.");
        } else {
          setDepositedCollateralError(null);
        }
        if (isFirstDepositedCollateralFetch.current) {
          setIsLoadingDepositedCollateral(false);
          isFirstDepositedCollateralFetch.current = false; // Only set to false after first fetch
        }
      }
    };
    fetchAllDepositedCollateral();
    const intervalId = setInterval(fetchAllDepositedCollateral, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [accountObjectId, supportedCollateral, INDEXER_URL]);

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
              <AccountHealth
                totalPositionDelta={totalPositionDelta}
                totalCollateralValue={totalCollateralValue}
              />
              <ActionTabs
                account={account}
                accountObjectId={accountObjectId}
                accountStatsId={accountStatsId}
                isLoadingAccount={isLoadingAccountDetails}
                supportedCollateral={supportedCollateral}
                selectedMarketIndex={selectedAsset?.marketIndex}
                selectedMarketPriceFeedId={selectedAsset?.priceFeedId}
                userDepositedCollateral={userDepositedCollateral}
                isLoadingDepositedCollateral={isLoadingDepositedCollateral}
                depositedCollateralError={depositedCollateralError}
              />
            </aside>
          </div>
          <CurrentPositions 
            accountId={account?.address || null}
            accountObjectId={accountObjectId}
            accountStatsId={accountStatsId}
            availableAssets={availableAssets} 
            supportedCollateral={supportedCollateral}
            onTPDChange={setTotalPositionDelta}
          />
        </section>
      </div>
    </Layout>
  );
};

export default TradingPlatform;