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
import type { MinimalAccountInfo, SupportedCollateralToken as ExtSupportedCollateralToken, NotificationState as ExtNotificationState, DepositedCollateralDetail } from '../../lib/transactions/depositCollateral'; // Added for supportedCollateral type
import { PositionData } from '@/types'; // Import PositionData
import type { VaultAssetData } from '../../types/index'; // Import VaultAssetData from new central types file
import { bytesToHex } from '@noble/hashes/utils'; // Import bytesToHex

const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const PROGRAM_OBJECT_ID = process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID;
const ACCOUNT_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::accounts::Account` : undefined;
const PROGRAM_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::programs::Program` : undefined;
const PUBLIC_NETWORK_NAME = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as 'testnet' | 'devnet' | 'mainnet' | 'localnet'; 
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL; // Added for fetching accountStatsId
const LIQUIDATION_SERVICE_URL = process.env.NEXT_PUBLIC_LIQUIDATION_SERVICE_URL; // New URL for liquidation service

// Create a read-only SuiClient for fetching public program data
let readOnlySuiClient: SuiClient;
try {
    readOnlySuiClient = new SuiClient({ url: getFullnodeUrl(PUBLIC_NETWORK_NAME) });
} catch (e) {
    console.error("Failed to create readOnlySuiClient:", e);
    // Fallback or handle error appropriately
}

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
        token_address: string; 
        creation_num: number; // Backend returns u64, comes as number in JSON (potential precision loss for > 2^53)
    };
    amount: number; // Backend returns u64, comes as number in JSON (potential precision loss for > 2^53) - MUST TREAT AS BIGINT
};

// Type to store fetched collateral data along with a user-friendly name (from ActionTabs)
type CollateralInfo = ExtSupportedCollateralToken & {
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

  // State for current positions data (lifted from CurrentPositions)
  const [currentPositionsData, setCurrentPositionsData] = useState<PositionData[]>([]);

  // State for all vault marker IDs
  const [allVaultMarkerIds, setAllVaultMarkerIds] = useState<string[]>([]);
  const [isLoadingVaultMarkers, setIsLoadingVaultMarkers] = useState<boolean>(true);

  // --- Collateral Value Calculation and Logging ---
  const [totalCollateralValue, setTotalCollateralValue] = useState<number>(0);

  // State for Account Health Percentage
  const [accountHealthPercentage, setAccountHealthPercentage] = useState<number>(100);

  // State for managing liquidation process
  const [isLiquidating, setIsLiquidating] = useState<boolean>(false);
  const [liquidationError, setLiquidationError] = useState<string | null>(null);
  const [lastLiquidationAttemptTime, setLastLiquidationAttemptTime] = useState<number>(0);

  // Ref to hold the latest account health percentage for the delayed check
  const accountHealthPercentageRef = useRef(accountHealthPercentage);
  useEffect(() => {
    accountHealthPercentageRef.current = accountHealthPercentage;
  }, [accountHealthPercentage]);

  // Ref to hold the liquidation timer
  const liquidationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Deposited Collateral State (moved from ActionTabs) ---
  const [userDepositedCollateralDetails, setUserDepositedCollateralDetails] = useState<DepositedCollateralDetail[]>([]);
  const [isLoadingDepositedCollateral, setIsLoadingDepositedCollateral] = useState(false);
  const [depositedCollateralError, setDepositedCollateralError] = useState<string | null>(null);

  const isFirstDepositedCollateralFetch = useRef(true);

  useEffect(() => {
    let cancelled = false;
    async function calculateAndLogTotalCollateralValue() {
      if (!supportedCollateral.length || userDepositedCollateralDetails.length === 0) {
        setTotalCollateralValue(0);
        // console.log("[TradingPlatform] Total Collateral Value: 0");
        return;
      }
      let totalValue = 0;
      const pricePromises = userDepositedCollateralDetails.map(async (detail) => {
        const collateralDefinition = supportedCollateral.find(sc => sc.fields.token_info === detail.tokenInfo);
        if (!collateralDefinition) return 0;

        // amount is now for individual objects, so we sum them up
        // const amount = parseFloat(detail.amount); 
        // if (!amount || isNaN(amount) || amount <= 0) return 0;
        // Using rawAmount for calculation:
        const amountAsNumber = Number(detail.rawAmount);
        if (isNaN(amountAsNumber) || amountAsNumber <= 0) return 0;


        let priceFeedIdHex: string | undefined = collateralDefinition.fields.price_feed_id_bytes_hex;
        if (!priceFeedIdHex) {
            if (Array.isArray(collateralDefinition.fields.price_feed_id_bytes)) {
                try {
                    const bytes = Uint8Array.from(collateralDefinition.fields.price_feed_id_bytes);
                    priceFeedIdHex = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
                } catch { priceFeedIdHex = undefined; }
            }
        }
        if (!priceFeedIdHex) return 0;

        try {
          const priceData = await pythPriceFeedService.getLatestPrice(priceFeedIdHex);
          if (!priceData || typeof priceData.price !== "number" || isNaN(priceData.price)) return 0;
          const value = (Number(detail.rawAmount) / Math.pow(10, collateralDefinition.fields.token_decimals)) * priceData.price;
          return value;
        } catch {
          return 0;
        }
      });

      const values = await Promise.all(pricePromises);
      if (!cancelled) {
        totalValue = values.reduce((a, b) => a + b, 0);
        setTotalCollateralValue(totalValue);
        // console.log("[TradingPlatform] Total Collateral Value:", totalValue);
      }
    }
    calculateAndLogTotalCollateralValue();
    return () => { cancelled = true; };
  }, [userDepositedCollateralDetails, supportedCollateral]);

  // Calculate Account Health Percentage
  useEffect(() => {
    let computedPercentage = 100;
    if (typeof totalCollateralValue === "number" && totalCollateralValue > 0) {
      computedPercentage =
        ((totalCollateralValue + totalPositionDelta) / totalCollateralValue) * 100;
    }
    // Ensure accountHealthPercentage is never NaN or Infinity, default to 100 if issues.
    if (isNaN(computedPercentage) || !isFinite(computedPercentage)) {
        // console.warn(`[TradingPlatform] Computed percentage was NaN or Infinity. TCV: ${totalCollateralValue}, TPD: ${totalPositionDelta}. Defaulting to 100.`);
        computedPercentage = 100;
    }
    setAccountHealthPercentage(computedPercentage);
    // console.log("[TradingPlatform] Account Health Percentage:", computedPercentage.toFixed(2), "TPD:", totalPositionDelta, "TCV:", totalCollateralValue);
  }, [totalPositionDelta, totalCollateralValue]);

  // Effect to trigger liquidation with a delay and re-check
  useEffect(() => {
    const LIQUIDATION_COOLDOWN_MS = 60000; // 1 minute cooldown
    const LIQUIDATION_DELAY_MS = 1000; // 1 second delay

    // Define the actual liquidation execution logic
    // This function will be called after the delay if conditions are still met
    const performDelayedLiquidation = async () => {
      // Re-check critical conditions *inside* the delayed function, as state might have changed
      // accountObjectId is from the useEffect closure, which is fine as the effect re-runs if it changes.
      if (!PROGRAM_OBJECT_ID || !accountObjectId || !accountStatsId) {
        console.warn("[Liquidation] Missing critical IDs (Program, Account, or Stats) at time of delayed execution. Aborting.");
        setLiquidationError("Missing critical IDs for liquidation.");
        return;
      }

      if (currentPositionsData.length === 0 && userDepositedCollateralDetails.length === 0) {
        console.log("[Liquidation] No positions or collaterals to liquidate (at time of delayed execution).");
        return;
      }

      // Prevent re-triggering if already liquidating or within cooldown
      // This check is crucial to be up-to-date by using current state values
      if (isLiquidating || Date.now() - lastLiquidationAttemptTime < LIQUIDATION_COOLDOWN_MS) {
        const reason = isLiquidating ? "already liquidating" : "in cooldown";
        console.log(`[Liquidation] Skipping delayed execution: ${reason}.`);
        return;
      }

      setIsLiquidating(true);
      setLiquidationError(null);
      setLastLiquidationAttemptTime(Date.now()); // Record time when actual liquidation process starts
      console.log(`[Liquidation] Initiating account liquidation (after ${LIQUIDATION_DELAY_MS}ms delay and re-check) for account:`, accountObjectId);

      const positionsPayload = currentPositionsData.map(p => ({
        id: p.position_id,
        priceFeedIdBytes: p.price_feed_id_bytes.startsWith('0x')
          ? p.price_feed_id_bytes
          : '0x' + p.price_feed_id_bytes,
      }));

      const collateralsPayload = userDepositedCollateralDetails.map(detail => ({
        collateralId: detail.collateralId,
        markerId: detail.markerId,
        coinType: detail.tokenInfo, // This should be the full coin type string
        priceFeedIdBytes: detail.priceFeedIdBytes || "", // Ensure it's always a string
      })).filter(c => c.priceFeedIdBytes); // Filter out collaterals without a price feed ID

      if (collateralsPayload.length !== userDepositedCollateralDetails.length) {
        console.warn("[Liquidation] Some collaterals were filtered out (delayed check) due to missing priceFeedIdBytes.");
      }

      const requestBody = {
        programId: PROGRAM_OBJECT_ID,
        accountObjectId,
        accountStatsId,
        positions: positionsPayload,
        collaterals: collateralsPayload,
        vaultMarkerIds: allVaultMarkerIds,
      };

      console.log("[Liquidation] Request body (delayed check):", JSON.stringify(requestBody, null, 2));

      try {
        if (!LIQUIDATION_SERVICE_URL) {
          throw new Error("Liquidation service URL is not configured. Please set NEXT_PUBLIC_LIQUIDATION_SERVICE_URL.");
        }
        const response = await fetch(`${LIQUIDATION_SERVICE_URL}/liquidate_account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        if (!response.ok) {
          throw new Error(responseData.error || `Liquidation failed with status: ${response.status}`);
        }
        console.log("[Liquidation] Success (delayed):", responseData);
        // TODO: Add user notification for successful liquidation
      } catch (error: any) {
        console.error("[Liquidation] Error (delayed):", error);
        setLiquidationError(error.message || "An unknown error occurred during delayed liquidation.");
        // TODO: Add user notification for failed liquidation
      } finally {
        setIsLiquidating(false);
      }
    };

    // --- Logic to schedule or clear the timer ---

    // If a timer is already running from a previous render/effect run, clear it.
    // This is crucial if accountHealthPercentage or accountObjectId changes, prompting a re-evaluation.
    if (liquidationTimerRef.current) {
      clearTimeout(liquidationTimerRef.current);
      liquidationTimerRef.current = null;
      // console.log("[Liquidation] Cleared existing timer due to effect re-run.");
    }

    // Conditions to schedule a new liquidation attempt
    // Use accountHealthPercentage from state for the initial check.
    if (accountObjectId && accountHealthPercentage <= 0) {
      console.log(
        `[Liquidation] Account health at or below 0% (${accountHealthPercentage.toFixed(2)}%). Scheduling liquidation check in ${LIQUIDATION_DELAY_MS}ms for account ${accountObjectId}.`
      );

      liquidationTimerRef.current = setTimeout(() => {
        // IMPORTANT: Re-check conditions using the most up-to-date values.
        // accountObjectId from the effect's closure is used here. If it became null, this effect would have re-run and cleared the timer.
        // accountHealthPercentageRef.current provides the latest health.
        console.log(`[Liquidation] Timer elapsed for account ${accountObjectId}. Re-checking health (ref: ${accountHealthPercentageRef.current.toFixed(2)}).`);

        if (accountObjectId && accountHealthPercentageRef.current <= 0) {
          console.log("[Liquidation] Account health still at or below 0% (ref check) and account active. Proceeding with liquidation.");
          performDelayedLiquidation().finally(() => {
            // Ensure the timer ref is cleared after the async operation (or if it bails out early)
            // Note: This might be redundant if performDelayedLiquidation itself clears it,
            // but it's safer to manage the ref here where the timer was created.
            if (liquidationTimerRef.current === (setTimeout(() => {}, 0) as any)) { // Basic check if it's our timer
                 // liquidationTimerRef.current = null; // Timer ref is instance-specific, not just ID
            }
          });
        } else {
          let reason = "";
          if (!accountObjectId) reason = "accountObjectId became null";
          else reason = `account health recovered or changed (ref: ${accountHealthPercentageRef.current.toFixed(2)}%)`;
          console.log(`[Liquidation] Conditions no longer met after delay (${reason}). Aborting delayed liquidation for account ${accountObjectId}.`);
          // liquidationTimerRef.current = null; // Timer ref is cleared if aborted after timer fires
        }
        // Always clear the ref for THIS timer instance once its callback has executed.
        liquidationTimerRef.current = null;

      }, LIQUIDATION_DELAY_MS);
    }
    // No 'else' block here to clear the timer, as it's handled at the top of the effect.
    // If conditions (health > 0 or no accountId) are not met, any existing timer
    // would have been cleared by the lines at the start of this effect.

    // Cleanup function for the useEffect: clear timer if component unmounts or dependencies change before timer fires.
    return () => {
      if (liquidationTimerRef.current) {
        clearTimeout(liquidationTimerRef.current);
        liquidationTimerRef.current = null;
        // console.log("[Liquidation] Cleared liquidation timer on effect cleanup for account", accountObjectId);
      }
    };
  }, [
    accountHealthPercentage, // Main trigger for evaluation
    accountObjectId,         // Critical for any action and for performDelayedLiquidation closure
    // Dependencies for performDelayedLiquidation (captured by its closure, effect re-runs if they change, creating a new closure)
    accountStatsId,
    PROGRAM_OBJECT_ID,
    currentPositionsData,
    userDepositedCollateralDetails,
    allVaultMarkerIds,
    isLiquidating,             // To re-evaluate cooldown/ongoing liquidation status
    lastLiquidationAttemptTime,// To re-evaluate cooldown
    LIQUIDATION_SERVICE_URL,
    // setLiquidationError, setIsLiquidating, setLastLiquidationAttemptTime are stable setters from useState
  ]);

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
      setUserDepositedCollateralDetails([]);
      setIsLoadingDepositedCollateral(false);
      isFirstDepositedCollateralFetch.current = true; 
      return;
    }
    let cancelled = false;
    const fetchAllDepositedCollateral = async () => {
      if (isFirstDepositedCollateralFetch.current) setIsLoadingDepositedCollateral(true);
      let fetchErrorOccurred = false;
      const accountIdForUrl = accountObjectId.startsWith('0x') ? accountObjectId.substring(2) : accountObjectId;

      // This will hold all individual collateral objects from all supported token types
      const allIndividualCollateralDetails: DepositedCollateralDetail[] = [];

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
              // 404 is not an error, just means no collateral of this type
              return []; // Return empty array for this token type
            }
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `Failed to fetch deposited collateral for ${token.name}: ${response.status}`);
          }
          const data: DepositedCollateralResponse[] = await response.json();
          
          if (Array.isArray(data) && data.length > 0) {
            return data.map((deposit: DepositedCollateralResponse): DepositedCollateralDetail => {
                const collateralIdHex = "0x" + bytesToHex(Uint8Array.from(deposit.collateral_id));
                const markerIdHex = "0x" + bytesToHex(Uint8Array.from(deposit.collateral_marker_id));
                
                let depositTokenInfo = (deposit.token_id && deposit.token_id.token_address) 
                                        ? (deposit.token_id.token_address.startsWith('0x') ? deposit.token_id.token_address : '0x' + deposit.token_id.token_address)
                                        : token.fields.token_info; // Fallback to the supportedCollateral's tokenInfo

                const priceFeedIdBytes = token.fields.price_feed_id_bytes_hex?.startsWith('0x') 
                                        ? token.fields.price_feed_id_bytes_hex 
                                        : (token.fields.price_feed_id_bytes_hex ? '0x' + token.fields.price_feed_id_bytes_hex : undefined);
                
                const rawAmountBigInt = BigInt(String(deposit.amount));
                let formattedAmount = "0";
                try {
                    if (typeof rawAmountBigInt === "bigint" && typeof decimals === "number") {
                        formattedAmount = (Number(rawAmountBigInt) / Math.pow(10, decimals)).toString();
                    } else {
                        formattedAmount = rawAmountBigInt.toString();
                    }
                } catch {
                    formattedAmount = rawAmountBigInt.toString();
                }

                return {
                    collateralId: collateralIdHex,
                    markerId: markerIdHex,
                    tokenInfo: depositTokenInfo,
                    amount: formattedAmount, // Formatted amount for THIS specific object
                    priceFeedIdBytes: priceFeedIdBytes,
                    rawAmount: rawAmountBigInt // Raw amount for THIS specific object
                };
            });
          } else {
            return []; // Return empty array if no collateral of this type
          }
        } catch (error) {
          console.error(`Error fetching deposited collateral for ${token.name}:`, error);
          fetchErrorOccurred = true;
          return []; // Return empty on error for this token
        }
      });

      const resultsByTokenType = await Promise.all(fetchPromises);
      const combinedDetails = resultsByTokenType.flat(); // Flatten array of arrays
      
      if (!cancelled) {
        setUserDepositedCollateralDetails(combinedDetails);
        if (fetchErrorOccurred) {
          setDepositedCollateralError("Error fetching some deposited collateral objects. Check console.");
        } else {
          setDepositedCollateralError(null);
        }
        if (isFirstDepositedCollateralFetch.current) {
          setIsLoadingDepositedCollateral(false);
          isFirstDepositedCollateralFetch.current = false; 
        }
      }
    };
    fetchAllDepositedCollateral();
    const intervalId = setInterval(fetchAllDepositedCollateral, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [accountObjectId, supportedCollateral, INDEXER_URL]); // Removed bytesToHex as it's imported directly

  const handleAssetSelect = (asset: SelectableMarketAsset) => {
    setSelectedAsset(asset);
    console.log("[TradingPlatform] New asset selected:", asset);
  };

  const handlePositionsChange = (positions: PositionData[]) => {
    setCurrentPositionsData(positions);
  };

  // Fetch all Vault Marker IDs
  useEffect(() => {
    let isMounted = true;
    const fetchVaultMarkers = async () => {
      if (!INDEXER_URL) {
        console.warn("[TradingPlatform] Indexer URL not set, cannot fetch vault markers.");
        setIsLoadingVaultMarkers(false);
        return;
      }
      setIsLoadingVaultMarkers(true);
      try {
        const response = await fetch(`${INDEXER_URL}/v0/vaults`);
        if (!response.ok) {
          throw new Error(`Failed to fetch vaults: ${response.status}`);
        }
        const vaultsData: VaultAssetData[] = await response.json();
        if (isMounted) {
          const markerIds = vaultsData.map(vault => vault.vault_marker_address);
          setAllVaultMarkerIds(markerIds);
          console.log("[TradingPlatform] Fetched all vault marker IDs:", markerIds);
        }
      } catch (error) {
        console.error("[TradingPlatform] Error fetching vault markers:", error);
        if (isMounted) {
          setAllVaultMarkerIds([]); // Clear on error
        }
      } finally {
        if (isMounted) {
          setIsLoadingVaultMarkers(false);
        }
      }
    };

    fetchVaultMarkers();
    return () => { isMounted = false; };
  }, []); 

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
                accountHealthPercentage={accountHealthPercentage}
              />
              <ActionTabs
                account={account}
                accountObjectId={accountObjectId}
                accountStatsId={accountStatsId}
                isLoadingAccount={isLoadingAccountDetails}
                supportedCollateral={supportedCollateral}
                selectedMarketIndex={selectedAsset?.marketIndex}
                selectedMarketPriceFeedId={selectedAsset?.priceFeedId}
                userDepositedCollateral={userDepositedCollateralDetails}
                isLoadingDepositedCollateral={isLoadingDepositedCollateral}
                depositedCollateralError={depositedCollateralError}
                availableAssets={availableAssets}
                totalCollateralValue={totalCollateralValue}
                totalPositionDelta={totalPositionDelta}
                currentPositionsData={currentPositionsData}
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
            onPositionsChange={handlePositionsChange}
          />
        </section>
      </div>
    </Layout>
  );
};

export default TradingPlatform;