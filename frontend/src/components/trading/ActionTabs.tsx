import React, { useState, useEffect } from "react";
import {
    // useCurrentAccount, // Removed, account will be a prop
    useSuiClientQuery,
    useSignAndExecuteTransaction,
    useSuiClient,
} from "@mysten/dapp-kit";
import { PaginatedObjectsResponse, CoinBalance, SuiClient, DevInspectResults } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import NotificationPopup from '../common/NotificationPopup';
import { formatUnits, parseUnits } from 'viem'; 
import { depositCollateral, DepositCollateralParams, DepositCollateralCallbacks, SupportedCollateralToken as ExtSupportedCollateralToken, NotificationState as ExtNotificationState, MinimalAccountInfo } from '../../lib/transactions/depositCollateral'; // Added import
import { withdrawCollateral, WithdrawCollateralParams, WithdrawCollateralCallbacks } from '../../lib/transactions/withdrawCollateral'; // Added import
import { openPosition, OpenPositionParams, OpenPositionCallbacks, PositionType as ExtPositionType } from '../../lib/transactions/openPosition'; // Added import
import { SuiPythClient } from '@pythnetwork/pyth-sui-js'; // New import for Pyth Client

// Assuming Icons.tsx exists and exports necessary icons like TokenIcon
// import { TokenIcon } from './Icons';

// --- Component Types ---
type TabType = "Positions" | "Collateral";
type PositionType = ExtPositionType; // Use imported type
type CollateralActionType = "Deposit" | "Withdraw";
type NotificationState = ExtNotificationState; // Use imported type

// Type matching the backend /api/supportedCollateral response structure
type SupportedCollateralToken = ExtSupportedCollateralToken; // Use imported type

// Type to store fetched collateral data along with a user-friendly name
type CollateralInfo = SupportedCollateralToken & {
    name: string; // User-friendly name like 'SUI', 'USDC'
};

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

// Define Props for ActionTabs
interface ActionTabsProps {
    account: MinimalAccountInfo | null; // Use MinimalAccountInfo as it's used by transaction functions
    accountObjectId: string | null;
    isLoadingAccount: boolean; 
}

// --- Constants ---
const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const PROGRAM_ID_CONST = process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID; 
const GLOBAL_OBJECT_ID_CONST = process.env.NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID;
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL;
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;
const PYTH_STATE_OBJECT_ID_CONST = process.env.NEXT_PUBLIC_PYTH_STATE_OBJECT_ID || "0xPLACEHOLDER_PYTH_STATE_ID"; 
const WORMHOLE_STATE_ID_CONST = process.env.NEXT_PUBLIC_WORMHOLE_STATE_OBJECT_ID || "0xPLACEHOLDER_WORMHOLE_STATE_ID";
const HERMES_ENDPOINT_CONST = process.env.NEXT_PUBLIC_HERMES_ENDPOINT || "https://hermes-beta.pyth.network";
const ENABLE_DEV_INSPECT_DEPOSIT = false;

// --- Helper Functions ---
// Basic Slider component placeholder (replace with actual implementation or library)
const Slider: React.FC<{ value: number; onChange: (value: number) => void }> = ({ value, onChange }) => {
    return (
      <input
        type="range"
        min="1"
        max="100" // Example max leverage
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
      />
    );
};

// Basic Select component placeholder (replace with actual implementation or library)
const Select: React.FC<{ options: { value: string; label: string }[]; selected: string; onChange: (value: string) => void; className?: string }> = ({ options, selected, onChange, className }) => {
    return (
        <select
            value={selected}
            onChange={(e) => onChange(e.target.value)}
            className={className || "w-full"}
        >
            {options.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800 text-primaryText">{option.label}</option>
            ))}
        </select>
    );
};

// Function to extract a readable name from the token_info type string
const getTokenNameFromType = (typeString: string): string => {
  const parts = typeString.split('::');
  return parts[parts.length - 1] || typeString; 
};

// Function to format balance using decimals
const formatBalance = (balance: string | bigint, decimals: number): string => {
    try {
        return formatUnits(BigInt(balance), decimals);
    } catch (e) {
        console.error("Error formatting balance:", e);
        return "0.0"; 
    }
};

// --- Main Component ---
const ActionTabs: React.FC<ActionTabsProps> = ({ account, accountObjectId, isLoadingAccount }) => {
  const [activeTab, setActiveTab] = useState<TabType>("Positions");
  const [positionType, setPositionType] = useState<PositionType>("Long");
  const [amount, setAmount] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(5); 
  const [collateralAction, setCollateralAction] = useState<CollateralActionType>("Deposit");
  const [supportedCollateral, setSupportedCollateral] = useState<CollateralInfo[]>([]);
  const [isLoadingCollateral, setIsLoadingCollateral] = useState(false);
  const [collateralError, setCollateralError] = useState<string | null>(null);
  const [selectedDepositTokenInfo, setSelectedDepositTokenInfo] = useState<string>("");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [selectedWithdrawTokenInfo, setSelectedWithdrawTokenInfo] = useState<string>(""); 
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [userWalletBalances, setUserWalletBalances] = useState<Record<string, string>>({}); 
  const [isLoadingWalletBalances, setIsLoadingWalletBalances] = useState(false); 
  const [userDepositedCollateral, setUserDepositedCollateral] = useState<Record<string, string>>({}); 
  const [isLoadingDepositedCollateral, setIsLoadingDepositedCollateral] = useState(false);
  const [depositedCollateralError, setDepositedCollateralError] = useState<string | null>(null);
  const [isLoadingTx, setIsLoadingTx] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);
  const [optimisticHasAccount, setOptimisticHasAccount] = useState<boolean>(false);
  const [accountStatsId, setAccountStatsId] = useState<string | null>(null); 
  const [isFetchingStatsId, setIsFetchingStatsId] = useState(false); 
  const [hasWalletBalancesLoadedOnce, setHasWalletBalancesLoadedOnce] = useState(false);
  const [hasDepositedCollateralLoadedOnce, setHasDepositedCollateralLoadedOnce] = useState(false);

  const client = useSuiClient(); 
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // Effect to clear states when accountObjectId (from props) changes
  useEffect(() => {
    setAccountStatsId(null); 
    setUserDepositedCollateral({}); 
    setDepositedCollateralError(null); 
    setHasWalletBalancesLoadedOnce(false); 
    setHasDepositedCollateralLoadedOnce(false);
  }, [accountObjectId]); 

  // Effect to fetch AccountStats ID when Account Object ID is known
  useEffect(() => {
    if (!accountObjectId || !account) {
        setAccountStatsId(null); 
        return;
    }
    if (accountStatsId) { // Only fetch if not already set
        return;
    }
    const fetchAccountStatsId = async () => {
        console.log(`Fetching account stats for account object ID: ${accountObjectId}`);
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
            } else {
                 console.error("Account stats ID not found or invalid in response:", data);
                 setNotification({ show: true, message: "Account stats ID not found or invalid in response.", type: 'error' });
                 throw new Error("Account stats ID not found or invalid in response.");
            }
        } catch (error) {
            console.error('Error fetching account stats ID:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            setNotification({ show: true, message: `Error loading account details: ${errorMsg}`, type: 'error' });
            setAccountStatsId(null);
        } finally {
            setIsFetchingStatsId(false);
        }
    };
    fetchAccountStatsId();
  }, [accountObjectId, account, INDEXER_URL, accountStatsId]); 

  const canDisplayTradingUI = account && accountObjectId && accountStatsId;
  const isLoadingCoreData = isLoadingAccount || (!!accountObjectId && isFetchingStatsId);

  // Query for all *Wallet* Coin Balances
  const { data: walletBalancesData, isLoading: isLoadingWalletBalancesQuery } = useSuiClientQuery(
    'getAllBalances',
    { owner: account?.address || '' },
    {
      enabled: !!account && supportedCollateral.length > 0, 
      refetchInterval: 5000,
      select: (data: CoinBalance[]) => {
        const balancesMap: Record<string, string> = {};
        data.forEach((coin) => {
          const collateralInfo = supportedCollateral.find(c => c.fields.token_info === coin.coinType);
          if (collateralInfo) {
            balancesMap[coin.coinType] = formatBalance(coin.totalBalance, collateralInfo.fields.token_decimals);
          }
        });
        return balancesMap;
      },
    }
  );

  useEffect(() => {
    setIsLoadingWalletBalances(isLoadingWalletBalancesQuery);
    if (walletBalancesData) {
      setUserWalletBalances(walletBalancesData);
    } else if (!isLoadingWalletBalancesQuery) {
      setUserWalletBalances({});
    }
    if (!isLoadingWalletBalancesQuery && !hasWalletBalancesLoadedOnce) {
        setHasWalletBalancesLoadedOnce(true);
    }
  }, [walletBalancesData, isLoadingWalletBalancesQuery, hasWalletBalancesLoadedOnce]);

  useEffect(() => {
    const fetchCollateral = async () => {
      setIsLoadingCollateral(true);
      setCollateralError(null);
      setNotification(null);
      try {
        const response = await fetch(`${BACKEND_API_URL}/api/supportedCollateral`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data && Array.isArray(data.supportedCollateral)) {
          const processedCollateral = data.supportedCollateral
            .filter((token: SupportedCollateralToken) => !token.fields.deprecated)
            .map((token: SupportedCollateralToken) => ({
              ...token,
              name: getTokenNameFromType(token.fields.token_info),
            }));
          setSupportedCollateral(processedCollateral);
          if (processedCollateral.length > 0 && !selectedDepositTokenInfo) {
            setSelectedDepositTokenInfo(processedCollateral[0].fields.token_info);
          }
        } else {
          throw new Error("Invalid data format received from collateral endpoint.");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setCollateralError(`Failed to load supported collateral: ${errorMsg}`);
        setNotification({ show: true, message: `Failed to load supported collateral: ${errorMsg}`, type: 'error' });
      } finally {
        setIsLoadingCollateral(false);
      }
    };
    fetchCollateral();
  }, [BACKEND_API_URL, selectedDepositTokenInfo]);

  useEffect(() => {
    if (!accountObjectId || supportedCollateral.length === 0 || !INDEXER_URL) {
        setUserDepositedCollateral({}); 
        setIsLoadingDepositedCollateral(false);
        return;
    }
    const fetchAllDepositedCollateral = async () => {
        setIsLoadingDepositedCollateral(true);
        const newDepositedBalances: Record<string, string> = {};
        let fetchErrorOccurred = false;
        const accountIdForUrl = accountObjectId.startsWith('0x') ? accountObjectId.substring(2) : accountObjectId;

        for (const token of supportedCollateral) {
            const tokenInfo = token.fields.token_info;
            const decimals = token.fields.token_decimals;
            const tokenInfoForUrl = tokenInfo.startsWith('0x') ? tokenInfo.substring(2) : tokenInfo;
            const encodedTokenInfo = encodeURIComponent(tokenInfoForUrl);
            const url = `${INDEXER_URL}/v0/${accountIdForUrl}/collateral/${encodedTokenInfo}`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 404) {
                        newDepositedBalances[tokenInfo] = formatBalance(BigInt(0), decimals);
                        continue;
                    }
                    const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                    throw new Error(errorData.error || `Failed to fetch deposited collateral for ${token.name}: ${response.status}`);
                }
                const data: DepositedCollateralResponse[] = await response.json();
                let totalDepositedAmount = BigInt(0);
                data.forEach(deposit => { totalDepositedAmount += BigInt(String(deposit.amount)); });
                newDepositedBalances[tokenInfo] = formatBalance(totalDepositedAmount, decimals);
            } catch (error) {
                console.error(`Error fetching deposited collateral for ${token.name}:`, error);
                fetchErrorOccurred = true;
                newDepositedBalances[tokenInfo] = "Error";
            }
        }
        setUserDepositedCollateral(newDepositedBalances);
        if (fetchErrorOccurred && !depositedCollateralError) {
            setDepositedCollateralError("Error fetching some deposited collateral balances. Check console.");
            setNotification({ show: true, message: "Error fetching some deposited collateral balances. See console.", type: 'error' });
        } else if (!fetchErrorOccurred) {
            setDepositedCollateralError(null);
        }
        setIsLoadingDepositedCollateral(false);
        if (!hasDepositedCollateralLoadedOnce) {
            setHasDepositedCollateralLoadedOnce(true);
        }
    };
    fetchAllDepositedCollateral();
    const intervalId = setInterval(fetchAllDepositedCollateral, 5000);
    return () => clearInterval(intervalId);
  }, [accountObjectId, supportedCollateral, INDEXER_URL, depositedCollateralError, hasDepositedCollateralLoadedOnce]);

  useEffect(() => {
    const availableWithdrawTokens = supportedCollateral
        .filter(token => {
            const balanceStr = userDepositedCollateral[token.fields.token_info];
            const balance = balanceStr && balanceStr !== "Error" ? parseFloat(balanceStr) : 0;
            return balance > 0;
        })
        .map(token => token.fields.token_info); 
    if (collateralAction === "Withdraw") {
        if (availableWithdrawTokens.length > 0) {
            if (!selectedWithdrawTokenInfo || !availableWithdrawTokens.includes(selectedWithdrawTokenInfo)) {
                setSelectedWithdrawTokenInfo(availableWithdrawTokens[0]);
            }
        } else {
            setSelectedWithdrawTokenInfo("");
        }
        setWithdrawAmount("");
    }
  }, [collateralAction, supportedCollateral, userDepositedCollateral, selectedWithdrawTokenInfo]);

  const handleCreateAccount = async () => {
    setNotification(null);
    if (!account) { 
      setNotification({ show: true, message: "Wallet not connected. Please connect your wallet.", type: 'error' });
      return;
    }
    if (!PACKAGE_ID || !PROGRAM_ID_CONST || !GLOBAL_OBJECT_ID_CONST || !/^0x[0-9a-fA-F]{1,64}$/.test(PACKAGE_ID) || !/^0x[0-9a-fA-F]{1,64}$/.test(PROGRAM_ID_CONST) || !/^0x[0-9a-fA-F]{1,64}$/.test(GLOBAL_OBJECT_ID_CONST)) {
        const message = !PACKAGE_ID ? "Package ID missing." : !PROGRAM_ID_CONST ? "Program ID missing." : !GLOBAL_OBJECT_ID_CONST ? "Global Object ID missing." : "Invalid Package, Program, or Global Object ID format.";
        setNotification({ show: true, message: `Configuration error: ${message}`, type: 'error' });
        return;
    }
    setIsLoadingTx(true);
    try {
        const txb = new Transaction();
        txb.moveCall({ target: `${PACKAGE_ID}::accounts::init_account`, arguments: [txb.object(PROGRAM_ID_CONST)] });
        signAndExecuteTransaction({ transaction: txb }, {
            onSuccess: (result) => {
                setOptimisticHasAccount(true);
                setActiveTab('Positions');
                setNotification({ show: true, message: 'Account created successfully!', type: 'success', digest: result.digest });
            },
            onError: (error) => {
                 setNotification({ show: true, message: `Error creating account: ${error.message}`, type: 'error' });
            },
            onSettled: () => setIsLoadingTx(false)
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setNotification({ show: true, message: `Error preparing transaction: ${errorMsg}`, type: 'error' });
        setIsLoadingTx(false);
    }
  };

  const handlePositionClick = (newPosition: PositionType) => setPositionType(newPosition);
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value);
  const handleLeverageChange = (value: number) => setLeverage(value);

  const handleOpenPosition = async () => {
    if (!PACKAGE_ID || !PROGRAM_ID_CONST || !GLOBAL_OBJECT_ID_CONST || !PYTH_STATE_OBJECT_ID_CONST || !WORMHOLE_STATE_ID_CONST || !HERMES_ENDPOINT_CONST || !INDEXER_URL) {
        setNotification({ show: true, message: "Client-side configuration error: Missing required environment variables.", type: 'error' });
        return;
    }
    if (!account || !accountObjectId || !accountStatsId) { 
        setNotification({ show: true, message: "Account data not ready for opening position.", type: 'error' });
        return;
    }
    if (!amount) { 
        setNotification({ show: true, message: "Please enter an amount for the position.", type: 'error' });
        return;
    }
    const suiPythClient = new SuiPythClient(client, PYTH_STATE_OBJECT_ID_CONST, WORMHOLE_STATE_ID_CONST);
    const params: OpenPositionParams = {
        account,
        accountObjectId,
        accountStatsId,
        packageId: PACKAGE_ID,
        globalObjectId: GLOBAL_OBJECT_ID_CONST,
        programId: PROGRAM_ID_CONST,
        pythStateObjectId: PYTH_STATE_OBJECT_ID_CONST,
        wormholeStateId: WORMHOLE_STATE_ID_CONST,
        hermesEndpoint: HERMES_ENDPOINT_CONST,
        pythClient: suiPythClient, 
        positionMarketIndex: 0, 
        indexerUrl: INDEXER_URL,
        positionType, amount, leverage, supportedCollateral, suiClient: client, signAndExecuteTransaction,
    };
    const callbacks: OpenPositionCallbacks = { setNotification, setIsLoadingTx, clearForm: () => setAmount("") };
    await openPosition(params, callbacks);
  };

  const handleDepositAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => setDepositAmount(e.target.value);
  const handleDepositTokenChange = (value: string) => setSelectedDepositTokenInfo(value);
  const handleWithdrawTokenChange = (value: string) => { setSelectedWithdrawTokenInfo(value); setWithdrawAmount(""); };
  const handleWithdrawAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setWithdrawAmount(e.target.value);

  const handleDeposit = async () => {
    if (!PACKAGE_ID || !PROGRAM_ID_CONST || !GLOBAL_OBJECT_ID_CONST) {
        setNotification({ show: true, message: "Client-side configuration error: Package, Program, or Global Object ID is missing.", type: 'error' });
        return;
    }
     if (!account || !accountObjectId || !accountStatsId) { 
         setNotification({ show: true, message: "Account data not fully loaded or wallet disconnected. Cannot initiate deposit.", type: 'error' });
         return;
     }
    const params: DepositCollateralParams = {
      account, accountObjectId, accountStatsId, packageId: PACKAGE_ID, programId: PROGRAM_ID_CONST,
      selectedDepositTokenInfo, depositAmount, supportedCollateral, userWalletBalances, suiClient: client, 
      signAndExecuteTransaction, enableDevInspect: ENABLE_DEV_INSPECT_DEPOSIT,
    };
    const callbacks: DepositCollateralCallbacks = { setNotification, setIsLoadingTx, clearForm: () => setDepositAmount("") };
    await depositCollateral(params, callbacks);
  };

  const handleWithdraw = async () => {
    if (!PACKAGE_ID || !PROGRAM_ID_CONST || !GLOBAL_OBJECT_ID_CONST) {
        setNotification({ show: true, message: "Client-side configuration error: Package, Program, or Global Object ID is missing.", type: 'error' });
        return;
    }
    if (!account || !accountObjectId || !accountStatsId) { 
        setNotification({ show: true, message: "Account data not fully loaded or wallet disconnected. Cannot initiate withdrawal.", type: 'error' });
        return;
    }
    if (!selectedWithdrawTokenInfo || !withdrawAmount) {
        setNotification({ show: true, message: "Please select a token and enter an amount to withdraw.", type: 'error' });
        return;
    }
    const params: WithdrawCollateralParams = {
        account, accountObjectId, accountStatsId, packageId: PACKAGE_ID, programId: PROGRAM_ID_CONST,
        selectedWithdrawTokenInfo, withdrawAmount, supportedCollateral, suiClient: client, signAndExecuteTransaction,
    };
    const callbacks: WithdrawCollateralCallbacks = { setNotification, setIsLoadingTx, clearForm: () => setWithdrawAmount("") };
    await withdrawCollateral(params, callbacks);
  };

  const getLeverageColor = (value: number, maxLeverage: number = 100): string => {
    const minLeverage = 1;
    const normalized = Math.max(0, Math.min(1, (value - minLeverage) / (maxLeverage - minLeverage)));
    const hue = (1 - normalized) * 120;
    return `hsl(${hue}, 100%, 50%)`;
  };

  const depositTokenOptions = supportedCollateral.map(token => ({ value: token.fields.token_info, label: token.name }));
  const withdrawTokenOptions = supportedCollateral
    .filter(token => {
        const balanceStr = userDepositedCollateral[token.fields.token_info];
        return balanceStr && balanceStr !== "Error" && parseFloat(balanceStr) > 0;
    })
    .map(token => ({ value: token.fields.token_info, label: token.name }));
  const getSelectedTokenName = (tokenInfo: string): string => supportedCollateral.find(t => t.fields.token_info === tokenInfo)?.name || "Token";
  const selectedWithdrawTokenDepositedBalanceStr = userDepositedCollateral[selectedWithdrawTokenInfo];
  const selectedWithdrawTokenDepositedBalance = selectedWithdrawTokenDepositedBalanceStr && selectedWithdrawTokenDepositedBalanceStr !== "Error" ? parseFloat(selectedWithdrawTokenDepositedBalanceStr) : 0;
  const withdrawAmountNum = parseFloat(withdrawAmount || '0');
  const isWithdrawAmountValid = withdrawAmountNum > 0 && withdrawAmountNum <= selectedWithdrawTokenDepositedBalance;
  const depositAmountNum = parseFloat(depositAmount || '0');
  const isDepositAmountValid = depositAmountNum > 0; 

  // --- Render Logic ---
  return (
    <section className="card bg-backgroundOffset mt-4 border border-secondary relative">
      {notification?.show && (
        <NotificationPopup
          message={notification.message}
          type={notification.type}
          digest={notification.digest}
          onClose={() => setNotification(null)}
        />
      )}
      {ENABLE_DEV_INSPECT_DEPOSIT && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded z-10">DEV INSPECT ACTIVE</div>
       )}
      {isLoadingCoreData && <div className="p-4 text-center text-secondaryText">Loading account data...</div>}
      {!isLoadingCoreData && account && !accountObjectId && (
        <div className="p-4">
          {isLoadingTx && <p className="text-center text-secondaryText mt-2 text-sm">Processing...</p>}
          <button className="btn-action w-full" onClick={handleCreateAccount} disabled={!account || isLoadingTx}>
            {isLoadingTx ? "Creating..." : "Create Account"}
          </button>
          {!isLoadingTx && <p className="text-center text-secondaryText mt-2 text-sm">Create a Pismo Protocol account to start trading.</p>}
        </div>
      )}
      {!account && <div className="p-4"><p className="text-center text-secondaryText mt-2 text-sm">Connect your wallet to begin.</p></div>}
      {!isLoadingCoreData && account && accountObjectId && !accountStatsId && (
           <div className="p-4 text-center text-red-500">Failed to load account details. Please check console or try refreshing.</div>
      )}
      {!isLoadingCoreData && canDisplayTradingUI && (
        <>
          <div className="flex gap-2 font-semibold text-center whitespace-nowrap">
            <button className={`position-button flex-1 ${activeTab === "Positions" ? "position-button-active" : "position-button-inactive"} px-4 py-3`} onClick={() => setActiveTab("Positions")}>Positions</button>
            <button className={`position-button flex-1 ${activeTab === "Collateral" ? "position-button-active" : "position-button-inactive"} px-4 py-3`} onClick={() => setActiveTab("Collateral")}>Collateral</button>
          </div>
          <div className="p-4">
            {activeTab === "Positions" && (
              <div>
                <div className="flex gap-2 mb-6 max-sm:gap-2">
                  <button className={`position-button flex-1 py-2 px-4 ${positionType === "Long" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gray-700 hover:bg-gray-600"} text-white font-bold`} onClick={() => handlePositionClick("Long")}>Long</button>
                  <button className={`position-button flex-1 py-2 px-4 ${positionType === "Short" ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"} text-white font-bold`} onClick={() => handlePositionClick("Short")}>Short</button>
                </div>
                <div className="mb-6">
                  <label className="input-label block text-secondaryText mb-2" htmlFor="leverage-slider">Leverage: <span className="font-semibold" style={{ color: getLeverageColor(leverage) }}>{leverage}x</span></label>
                  <Slider value={leverage} onChange={handleLeverageChange} />
                </div>
                <div className="mb-6">
                  <label className="input-label block text-secondaryText mb-2" htmlFor="amount-input">Amount</label>
                    <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                    <input id="amount-input" type="text" className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent" value={amount} onChange={handleAmountChange} placeholder="0.00"/>
                    </div>
                </div>
                <button className="btn-action w-full mt-6" onClick={handleOpenPosition} disabled={!amount || isLoadingTx || !accountObjectId || !accountStatsId || !(selectedDepositTokenInfo || (supportedCollateral.length > 0))}>
                  {isLoadingTx ? "Processing..." : `Place ${positionType} Order`}
                </button>
              </div>
            )}
            {activeTab === "Collateral" && (
              <div>
                 <div className="flex gap-2 mb-6 max-sm:gap-2 pb-4">
                    <button className={`position-button flex-1 ${collateralAction === "Deposit" ? "position-button-active" : "position-button-inactive"} py-2 px-4`} onClick={() => setCollateralAction("Deposit")}>Deposit</button>
                    <button className={`position-button flex-1 ${collateralAction === "Withdraw" ? "position-button-active" : "position-button-inactive"} py-2 px-4`} onClick={() => setCollateralAction("Withdraw")}>Withdraw</button>
                </div>
                 {isLoadingCollateral && <p className="text-center text-secondaryText mb-4">Loading collateral types...</p>}
                 {collateralError && <p className="text-center text-red-500 mb-4">{collateralError}</p>}
                 {collateralAction === "Deposit" && !isLoadingCollateral && !collateralError && !hasWalletBalancesLoadedOnce && isLoadingWalletBalances && <p className="text-center text-secondaryText mb-4">Loading wallet balances...</p>}
                 {collateralAction === "Withdraw" && !isLoadingCollateral && !collateralError && !hasDepositedCollateralLoadedOnce && isLoadingDepositedCollateral && <p className="text-center text-secondaryText mb-4">Loading deposited balances...</p>}
                 {collateralAction === "Withdraw" && !isLoadingCollateral && !collateralError && depositedCollateralError && <p className="text-center text-red-500 mb-4">{depositedCollateralError}</p>}
                {collateralAction === "Deposit" && !isLoadingCollateral && !collateralError && (
                    <div className="space-y-4">
                        {supportedCollateral.length === 0 ? <p className="text-secondaryText text-center">No supported collateral types found.</p> : (
                         <>
                            <div>
                                <label className="input-label block text-secondaryText mb-2" htmlFor="token-select">Token</label>
                                <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                    <Select options={depositTokenOptions} selected={selectedDepositTokenInfo} onChange={handleDepositTokenChange} className="input-field bg-transparent border-none focus:outline-none w-full text-primaryText appearance-none"/>
                                </div>
                            </div>
                            <div>
                                <label className="input-label block text-secondaryText mb-2" htmlFor="deposit-amount-input">Amount {selectedDepositTokenInfo && <span className="text-xs text-gray-400 ml-2">Wallet Balance: {userWalletBalances[selectedDepositTokenInfo] || '0.0'}</span>}</label>
                                <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                    <input id="deposit-amount-input" type="text" className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent" value={depositAmount} onChange={handleDepositAmountChange} placeholder="0.00"/>
                                </div>
                            </div>
                            <button className="btn-action w-full mt-6" onClick={handleDeposit} disabled={!selectedDepositTokenInfo || !isDepositAmountValid || isLoadingTx || isFetchingStatsId || isLoadingWalletBalances} >
                                {isLoadingTx ? (ENABLE_DEV_INSPECT_DEPOSIT ? "Inspecting..." : "Depositing...") : (ENABLE_DEV_INSPECT_DEPOSIT ? `Inspect Deposit ${getSelectedTokenName(selectedDepositTokenInfo)}` : `Deposit ${getSelectedTokenName(selectedDepositTokenInfo)}`)}
                            </button>
                        </>
                        )}
                    </div>
                )}
                {collateralAction === "Withdraw" && !isLoadingCollateral && !collateralError && !depositedCollateralError && (
                    <div className="space-y-4">
                        <h3 className="input-label text-lg font-semibold text-secondaryText mb-3">Your Deposited Collateral</h3>
                        {withdrawTokenOptions.length === 0 ? <p className="text-secondaryText">No collateral deposited.</p> : (
                            <div className="space-y-2 border-y border-gray-700 py-3 mb-4">
                                {supportedCollateral.filter(token => { const balanceStr = userDepositedCollateral[token.fields.token_info]; return balanceStr && balanceStr !== "Error" && parseFloat(balanceStr) > 0; }).map(token => (
                                    <div key={token.fields.token_info} className="flex items-center justify-between gap-4 px-1">
                                        <div className="flex items-center gap-2"><span className="font-medium text-primaryText">{token.name}</span></div>
                                        <span className="text-sm text-secondaryText">{userDepositedCollateral[token.fields.token_info] || '0.0'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {withdrawTokenOptions.length > 0 && (
                            <>
                                <div>
                                    <label className="input-label block text-secondaryText mb-2" htmlFor="withdraw-token-select">Token</label>
                                    <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                        <Select options={withdrawTokenOptions} selected={selectedWithdrawTokenInfo} onChange={handleWithdrawTokenChange} className="input-field bg-transparent border-none focus:outline-none w-full text-primaryText appearance-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="input-label block text-secondaryText mb-2" htmlFor="withdraw-amount-input">Amount {selectedWithdrawTokenInfo && <span className="text-xs text-gray-400 ml-2">Deposited: {userDepositedCollateral[selectedWithdrawTokenInfo] || '0.0'}</span>}</label>
                                    <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                        <input id="withdraw-amount-input" type="text" className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent" value={withdrawAmount} onChange={handleWithdrawAmountInputChange} placeholder="0.00"/>
                                        {selectedWithdrawTokenDepositedBalance > 0 && <button onClick={() => setWithdrawAmount(String(selectedWithdrawTokenDepositedBalanceStr))} className="text-accent hover:text-accentHover text-sm font-medium" type="button">Max</button>}
                                    </div>
                                </div>
                                <button className="btn-action w-full mt-6" onClick={handleWithdraw} disabled={!selectedWithdrawTokenInfo || !isWithdrawAmountValid || isLoadingTx || isFetchingStatsId || isLoadingDepositedCollateral}>
                                    {isLoadingTx ? "Withdrawing..." : `Withdraw ${getSelectedTokenName(selectedWithdrawTokenInfo)}`}
                                </button>
                            </>
                        )}
                    </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default ActionTabs;

// Helper type (if needed, otherwise remove)
type InputElement = React.ChangeEvent<HTMLInputElement | HTMLSelectElement>; // Example combined type