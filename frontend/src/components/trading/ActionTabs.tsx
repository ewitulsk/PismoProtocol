import React, { useState, useEffect } from "react";
import {
    useCurrentAccount,
    useSuiClientQuery,
    useSignAndExecuteTransaction,
    useSuiClient,
} from "@mysten/dapp-kit";
import { PaginatedObjectsResponse, CoinBalance, SuiClient, DevInspectResults } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import NotificationPopup from '../common/NotificationPopup';
import { formatUnits, parseUnits } from 'viem'; 

// Assuming Icons.tsx exists and exports necessary icons like TokenIcon
// import { TokenIcon } from './Icons';

// --- Component Types ---
type TabType = "Positions" | "Collateral";
type PositionType = "Long" | "Short";
type CollateralActionType = "Deposit" | "Withdraw";
type NotificationState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  digest?: string;
} | null;

// Type matching the backend /api/supportedCollateral response structure
type SupportedCollateralToken = {
  type: string; // e.g., "...::tokens::TokenIdentifier"
  fields: {
    token_info: string; // e.g., "0x2::sui::SUI" or a package::module::CoinType
    token_decimals: number;
    price_feed_id_bytes: number[]; // Keep original bytes if needed
    price_feed_id_bytes_hex: string; // Hex representation
    oracle_feed: number; // 0 for Pyth, etc.
    deprecated: boolean;
  };
};

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


// --- Constants ---
const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const PROGRAM_ID = process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID;
const ACCOUNT_TYPE = `${PACKAGE_ID}::accounts::Account`;
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL;
const NEXT_PUBLIC_INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;

// <<< --- ADDED CONTROL CONSTANT --- >>>
// Set this to true to use devInspectTransactionBlock for deposits instead of signing/executing
const ENABLE_DEV_INSPECT_DEPOSIT = false;
// <<< ----------------------------- >>>

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
  // Example: "0x2::sui::SUI" -> "SUI"
  // Example: "0x...::usdc::USDC" -> "USDC"
  const parts = typeString.split('::');
  return parts[parts.length - 1] || typeString; // Return last part or full string if split fails
};

// Function to format balance using decimals
const formatBalance = (balance: string | bigint, decimals: number): string => {
    try {
        return formatUnits(BigInt(balance), decimals);
    } catch (e) {
        console.error("Error formatting balance:", e);
        return "0.0"; // Return default value on error
    }
};


// --- Main Component ---
const ActionTabs: React.FC = () => {
  // --- State ---
  const [activeTab, setActiveTab] = useState<TabType>("Positions");
  const [positionType, setPositionType] = useState<PositionType>("Long");
  const [amount, setAmount] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(5); // Default leverage
  const [collateralAction, setCollateralAction] = useState<CollateralActionType>("Deposit");

  // Collateral State
  const [supportedCollateral, setSupportedCollateral] = useState<CollateralInfo[]>([]);
  const [isLoadingCollateral, setIsLoadingCollateral] = useState(false);
  const [collateralError, setCollateralError] = useState<string | null>(null);

  // Deposit State
  const [selectedDepositTokenInfo, setSelectedDepositTokenInfo] = useState<string>(""); // Store the full token_info string
  const [depositAmount, setDepositAmount] = useState<string>("");

  // Withdraw State
  const [selectedWithdrawTokenInfo, setSelectedWithdrawTokenInfo] = useState<string>(""); // Store the full token_info string
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  // >>> MODIFIED: Renamed userCollateralBalances to userWalletBalances for clarity <<<
  const [userWalletBalances, setUserWalletBalances] = useState<Record<string, string>>({}); // Store WALLET balances (token_info -> formatted string amount)
  const [isLoadingWalletBalances, setIsLoadingWalletBalances] = useState(false); // Renamed
  // >>> NEW STATE: Store DEPOSITED collateral balances from indexer <<<
  const [userDepositedCollateral, setUserDepositedCollateral] = useState<Record<string, string>>({}); // (token_info -> formatted string amount)
  const [isLoadingDepositedCollateral, setIsLoadingDepositedCollateral] = useState(false);
  const [depositedCollateralError, setDepositedCollateralError] = useState<string | null>(null);


  // Transaction & Account State
  const [isLoadingTx, setIsLoadingTx] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);
  const [optimisticHasAccount, setOptimisticHasAccount] = useState<boolean>(false);

  // Account state variables
  const [accountObjectId, setAccountObjectId] = useState<string | null>(null); // Store Account Object ID
  const [accountStatsId, setAccountStatsId] = useState<string | null>(null); // Store AccountStats Object ID
  const [isFetchingStatsId, setIsFetchingStatsId] = useState(false); // Loading state for stats ID

  // >>> NEW STATE: Flags for initial data loads to prevent flashing of loading text on refresh <<<
  const [hasWalletBalancesLoadedOnce, setHasWalletBalancesLoadedOnce] = useState(false);
  const [hasDepositedCollateralLoadedOnce, setHasDepositedCollateralLoadedOnce] = useState(false);

  // --- Hooks ---
  const account = useCurrentAccount();
  const client = useSuiClient(); // Get SuiClient instance
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // Query for the Account object owned by the current user
  const { data: ownedAccountObject, isLoading: isLoadingAccount } = useSuiClientQuery(
    'getOwnedObjects',
    {
        owner: account?.address || '',
        filter: { StructType: ACCOUNT_TYPE },
        options: { showType: true, showContent: false, showOwner: false, showPreviousTransaction: false, showStorageRebate: false, showDisplay: false }, // Only need objectId
    },
    {
      enabled: !!account,
      refetchInterval: 5000, // Keep refetching
      select: (data: PaginatedObjectsResponse) => {
        if (data?.data && data.data.length > 0) {
            const accountObj = data.data.find(obj => obj.data?.objectId);
            return accountObj?.data?.objectId ?? null; // Return the objectId or null
        }
        return null;
      },
    }
  );

  // Update accountObjectId state when query data changes
  useEffect(() => {
    const newAccountId = ownedAccountObject ?? null;
    // Reset related states if account ID changes
    if (newAccountId !== accountObjectId) {
        setAccountStatsId(null);
        setUserDepositedCollateral({}); // Clear deposited collateral for new account
        setDepositedCollateralError(null); // Clear errors
        // >>> ADDED: Reset initial load flags when account changes <<< 
        setHasWalletBalancesLoadedOnce(false);
        setHasDepositedCollateralLoadedOnce(false);
    }
    setAccountObjectId(newAccountId);
  }, [ownedAccountObject, accountObjectId]);

  // Effect to fetch AccountStats ID when Account Object ID is known
  useEffect(() => {
    if (!accountObjectId || !account) {
        setAccountStatsId(null); // Clear if no account object ID or wallet disconnected
        return;
    }

    // Only fetch if accountStatsId is not already set
    if (accountStatsId) {
        return;
    }

    const fetchAccountStatsId = async () => {
        console.log(`Fetching account stats for account object ID: ${accountObjectId}`);
        setIsFetchingStatsId(true);
        // setNotification(null); // Original: Do not clear notification on auto-refresh. Keep this behavior for single fetch too.
        try {
            const accountIdForUrl = accountObjectId.startsWith('0x')
                ? accountObjectId.substring(2)
                : accountObjectId;
            const response = await fetch(`${NEXT_PUBLIC_INDEXER_URL}/v0/accounts/${accountIdForUrl}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                 throw new Error(errorData.error || `Failed to fetch account stats: ${response.status}`);
            }
            const data = await response.json();
            console.log("Fetched account stats data:", data);

            if (data && typeof data.stats_id === 'string' && data.stats_id) {
                const statsIdWithPrefix = data.stats_id.startsWith('0x')
                    ? data.stats_id
                    : '0x' + data.stats_id;
                setAccountStatsId(statsIdWithPrefix);
            } else {
                 console.error("Account stats ID not found or invalid in response:", data);
                 // Only set notification if it's a new error, not on subsequent auto-refresh failures of the same kind
                 // if (accountStatsId !== null) { // if it was previously successfully fetched or explicitly cleared
                    setNotification({
                        show: true,
                        message: "Account stats ID not found or invalid in response.",
                        type: 'error',
                    });
                 // }
                 throw new Error("Account stats ID not found or invalid in response.");
            }
        } catch (error) {
            console.error('Error fetching account stats ID:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            // Only set notification if it's a new error
            // if (accountStatsId !== null) {
                setNotification({
                    show: true,
                    message: `Error loading account details: ${errorMsg}`,
                    type: 'error',
                });
            // }
            setAccountStatsId(null);
        } finally {
            setIsFetchingStatsId(false);
        }
    };

    fetchAccountStatsId(); // Fetch once when conditions are met and statsId is not set

    // No interval needed as per user request
    // Ensure NEXT_PUBLIC_INDEXER_URL is in dependencies to refetch if it changes (though unlikely for this specific call now)
  }, [accountObjectId, account, NEXT_PUBLIC_INDEXER_URL, accountStatsId]);

  // Combined check for whether the main UI should display
  const canDisplayTradingUI = account && accountObjectId && accountStatsId;
  const isLoadingCoreData = isLoadingAccount || (!!accountObjectId && isFetchingStatsId);

  // Query for all *Wallet* Coin Balances
  const { data: walletBalancesData, isLoading: isLoadingWalletBalancesQuery } = useSuiClientQuery(
    'getAllBalances',
    {
      owner: account?.address || '',
    },
    {
      enabled: !!account && supportedCollateral.length > 0, // Only fetch if connected and collateral types are loaded
      refetchInterval: 5000,
      select: (data: CoinBalance[]) => {
        const balancesMap: Record<string, string> = {};
        console.log(`Processing ${data.length} wallet balances from getAllBalances...`);
        data.forEach((coin) => {
          const collateralInfo = supportedCollateral.find(c => c.fields.token_info === coin.coinType);
          if (collateralInfo) {
            balancesMap[coin.coinType] = formatBalance(coin.totalBalance, collateralInfo.fields.token_decimals);
          }
        });
        console.log("Processed wallet balances map:", balancesMap);
        return balancesMap;
      },
    }
  );

  // Update wallet balances state
  useEffect(() => {
    setIsLoadingWalletBalances(isLoadingWalletBalancesQuery);
    if (walletBalancesData) {
      setUserWalletBalances(walletBalancesData);
    } else if (!isLoadingWalletBalancesQuery) {
      setUserWalletBalances({});
    }

    // If the query is done loading and we haven't marked it as loaded once yet
    if (!isLoadingWalletBalancesQuery && !hasWalletBalancesLoadedOnce) {
        setHasWalletBalancesLoadedOnce(true);
    }
  }, [walletBalancesData, isLoadingWalletBalancesQuery, hasWalletBalancesLoadedOnce, setIsLoadingWalletBalances, setUserWalletBalances, setHasWalletBalancesLoadedOnce]);

  // --- Effects ---
  // Fetch Supported Collateral on Mount
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
        console.log("Fetched supported collateral:", data);

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
        console.error('Error fetching supported collateral:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        setCollateralError(`Failed to load supported collateral: ${errorMsg}`);
        setNotification({
            show: true,
            message: `Failed to load supported collateral: ${errorMsg}`,
            type: 'error',
        });
      } finally {
        setIsLoadingCollateral(false);
      }
    };

    fetchCollateral();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BACKEND_API_URL]);

  // >>> NEW EFFECT: Fetch Deposited Collateral from Indexer <<<
  useEffect(() => {
    if (!accountObjectId || supportedCollateral.length === 0 || !NEXT_PUBLIC_INDEXER_URL) {
        setUserDepositedCollateral({}); // Clear if prerequisites not met
        setIsLoadingDepositedCollateral(false);
        // setHasDepositedCollateralLoadedOnce(false); // This is handled by accountObjectId change effect
        return;
    }

    const fetchAllDepositedCollateral = async () => {
        console.log("Fetching deposited collateral from indexer for account:", accountObjectId);
        setIsLoadingDepositedCollateral(true);
        // setDepositedCollateralError(null); // Do not clear error on auto-refresh initially
        const newDepositedBalances: Record<string, string> = {};
        let fetchErrorOccurred = false;

        const accountIdForUrl = accountObjectId.startsWith('0x')
            ? accountObjectId.substring(2)
            : accountObjectId;

        for (const token of supportedCollateral) {
            const tokenInfo = token.fields.token_info;
            const decimals = token.fields.token_decimals;

            const tokenInfoForUrl = tokenInfo.startsWith('0x')
                ? tokenInfo.substring(2)
                : tokenInfo;
            const encodedTokenInfo = encodeURIComponent(tokenInfoForUrl);
            const url = `${NEXT_PUBLIC_INDEXER_URL}/v0/${accountIdForUrl}/collateral/${encodedTokenInfo}`;

            try {
                console.log(`Fetching deposited balance for ${token.name} (${tokenInfoForUrl}) from ${url}`);
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 404) {
                        console.log(`No deposited collateral found for ${token.name}`);
                        newDepositedBalances[tokenInfo] = formatBalance(BigInt(0), decimals);
                        continue;
                    } else {
                        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                        throw new Error(errorData.error || `Failed to fetch deposited collateral for ${token.name}: ${response.status}`);
                    }
                }
                const data: DepositedCollateralResponse[] = await response.json();
                let totalDepositedAmount = BigInt(0);
                data.forEach(deposit => {
                    totalDepositedAmount += BigInt(String(deposit.amount));
                });
                newDepositedBalances[tokenInfo] = formatBalance(totalDepositedAmount, decimals);
            } catch (error) {
                console.error(`Error fetching deposited collateral for ${token.name}:`, error);
                fetchErrorOccurred = true;
                newDepositedBalances[tokenInfo] = "Error";
            }
        }

        // ---- Start of finally block equivalent ----
        setUserDepositedCollateral(newDepositedBalances);
        if (fetchErrorOccurred) {
            if (!depositedCollateralError) {
                setDepositedCollateralError("Error fetching some deposited collateral balances. Check console.");
                setNotification({
                    show: true,
                    message: "Error fetching some deposited collateral balances. See console.",
                    type: 'error',
                });
            }
        } else {
            setDepositedCollateralError(null);
        }
        setIsLoadingDepositedCollateral(false);
        // >>> MODIFIED: Set flag after first load attempt <<<
        if (!hasDepositedCollateralLoadedOnce) {
            setHasDepositedCollateralLoadedOnce(true);
        }
        console.log("Final deposited collateral balances:", newDepositedBalances);
        // ---- End of finally block equivalent ----
    };

    fetchAllDepositedCollateral();
    const intervalId = setInterval(fetchAllDepositedCollateral, 5000);

    return () => {
        clearInterval(intervalId);
    };
  }, [accountObjectId, supportedCollateral, NEXT_PUBLIC_INDEXER_URL, depositedCollateralError, hasDepositedCollateralLoadedOnce, setUserDepositedCollateral, setIsLoadingDepositedCollateral, setDepositedCollateralError, setNotification, setHasDepositedCollateralLoadedOnce]);


  // Effect to set default selected withdraw token based on *deposited* balances
  useEffect(() => {
    // Filter supported collateral to find tokens the user has *deposited*
    const availableWithdrawTokens = supportedCollateral
        .filter(token => {
            const balanceStr = userDepositedCollateral[token.fields.token_info];
            // Check if balance exists, is not "Error", and is greater than 0
            const balance = balanceStr && balanceStr !== "Error" ? parseFloat(balanceStr) : 0;
            return balance > 0;
        })
        .map(token => token.fields.token_info); // Get the token_info (type string)

    if (collateralAction === "Withdraw") {
        if (availableWithdrawTokens.length > 0) {
            // If current selection is invalid or empty, set to the first available
            if (!selectedWithdrawTokenInfo || !availableWithdrawTokens.includes(selectedWithdrawTokenInfo)) {
                setSelectedWithdrawTokenInfo(availableWithdrawTokens[0]);
            }
        } else {
             // No withdrawable tokens, clear selection
            setSelectedWithdrawTokenInfo("");
        }
         // Reset amount when switching to withdraw or when available tokens change
        setWithdrawAmount("");
    }
  // Depend on deposited balances and collateral list
  }, [collateralAction, supportedCollateral, userDepositedCollateral, selectedWithdrawTokenInfo]);


  // --- Handlers ---

  // Placeholder function for creating an account
  const handleCreateAccount = async () => {
    setNotification(null);
    if (!account) {
      setNotification({ show: true, message: "Wallet not connected. Please connect your wallet.", type: 'error' });
      return;
    }
    if (!PACKAGE_ID || !PROGRAM_ID || !/^0x[0-9a-fA-F]{1,64}$/.test(PACKAGE_ID) || !/^0x[0-9a-fA-F]{1,64}$/.test(PROGRAM_ID)) {
        const message = !PACKAGE_ID ? "Package ID missing." : !PROGRAM_ID ? "Program ID missing." : "Invalid Package or Program ID format.";
        console.error("Configuration error:", message, { PACKAGE_ID, PROGRAM_ID });
        setNotification({ show: true, message: `Configuration error: ${message}`, type: 'error' });
        return;
    }

    console.log("Initiating create account transaction with Package ID:", PACKAGE_ID, "and Program ID:", PROGRAM_ID);
    setIsLoadingTx(true);

    try {
        const txb = new Transaction();
        txb.moveCall({
          target: `${PACKAGE_ID}::accounts::init_account`,
          arguments: [txb.object(PROGRAM_ID)],
        });

        signAndExecuteTransaction(
          { transaction: txb },
          {
            onSuccess: (result) => {
                console.log('Account created successfully!', result);
                setOptimisticHasAccount(true);
                setActiveTab('Positions');
                setNotification({
                    show: true,
                    message: 'Account created successfully!',
                    type: 'success',
                    digest: result.digest,
                });
                // TODO: Ideally trigger refetch of accountObjectId, accountStatsId, and deposited balances
            },
            onError: (error) => {
                console.error('Error creating account:', error);
                 setNotification({
                    show: true,
                    message: `Error creating account: ${error.message}`,
                    type: 'error',
                });
            },
            onSettled: () => {
                setIsLoadingTx(false);
            }
           }
        );
    } catch (error) {
        console.error('Error constructing transaction:', error);
         setNotification({
            show: true,
            message: `Error preparing transaction: ${error instanceof Error ? error.message : String(error)}`,
            type: 'error',
        });
        setIsLoadingTx(false);
    }
  };

  const handlePositionClick = (newPosition: PositionType) => {
    setPositionType(newPosition);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  const handleLeverageChange = (value: number) => {
    setLeverage(value);
  };

  // Deposit Handlers
  const handleDepositAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDepositAmount(e.target.value);
  };

  const handleDepositTokenChange = (value: string) => { // Value is the token_info string
    setSelectedDepositTokenInfo(value);
  };

  // Withdraw Handlers
  const handleWithdrawTokenChange = (value: string) => { // Value is the token_info string
    setSelectedWithdrawTokenInfo(value);
    setWithdrawAmount(""); // Reset amount when token changes
  };

  const handleWithdrawAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWithdrawAmount(e.target.value);
  };

  // Modified handleDeposit Function
  const handleDeposit = async () => {
     setNotification(null);
     setIsLoadingTx(true);

     // Validations
     if (!account || !accountObjectId || !accountStatsId) {
         setNotification({ show: true, message: "Account data not fully loaded or wallet disconnected.", type: 'error' });
         setIsLoadingTx(false);
         return;
     }
     if (!PACKAGE_ID || !PROGRAM_ID || !selectedDepositTokenInfo || !depositAmount) {
         setNotification({ show: true, message: "Configuration error or missing deposit details.", type: 'error' });
         setIsLoadingTx(false);
         return;
     }
     const selectedToken = supportedCollateral.find(t => t.fields.token_info === selectedDepositTokenInfo);
     if (!selectedToken) {
         setNotification({ show: true, message: "Selected token details not found.", type: 'error' });
         setIsLoadingTx(false);
         return;
     }

     const decimals = selectedToken.fields.token_decimals;
     let depositAmountBigInt: bigint;
     try {
         depositAmountBigInt = parseUnits(depositAmount, decimals);
         if (depositAmountBigInt <= BigInt(0)) {
             throw new Error("Deposit amount must be positive.");
         }
         // Optional: Check against wallet balance (userWalletBalances) before proceeding
         const walletBalanceStr = userWalletBalances[selectedDepositTokenInfo] || '0.0';
         const walletBalanceBigInt = parseUnits(walletBalanceStr, decimals);
         if (depositAmountBigInt > walletBalanceBigInt) {
            throw new Error(`Insufficient wallet balance (${walletBalanceStr} ${selectedToken.name})`);
         }

     } catch (e) {
         setNotification({ show: true, message: `Invalid deposit amount: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
         setIsLoadingTx(false);
         return;
     }

     console.log("Initiating deposit/inspect:", {
         mode: ENABLE_DEV_INSPECT_DEPOSIT ? 'DevInspect' : 'Execute',
         account: account.address,
         accountObjectId,
         accountStatsId,
         tokenType: selectedDepositTokenInfo,
         amount: depositAmount,
         amountBigInt: depositAmountBigInt.toString(),
         decimals,
         packageId: PACKAGE_ID,
         programId: PROGRAM_ID,
     });

     try {
        // Build Transaction Block
        const txb = new Transaction();
        let coinToDeposit;
        const suiCoinType = '0x2::sui::SUI';

        if (selectedDepositTokenInfo === suiCoinType) {
            [coinToDeposit] = txb.splitCoins(txb.gas, [depositAmountBigInt]);
            console.log("Splitting SUI from gas coin.");
        } else {
            console.log(`Fetching coin objects for type: ${selectedDepositTokenInfo}`);
            // Use non-blocking client call directly
            const { data: coins } = await client.getCoins({ owner: account.address, coinType: selectedDepositTokenInfo });
            if (!coins || coins.length === 0) throw new Error(`No '${selectedToken.name}' coin objects found.`);

            // Attempt to find a single coin with enough balance
            const sourceCoin = coins.find(c => BigInt(c.balance) >= depositAmountBigInt);
            if (sourceCoin) {
                console.log(`Using coin object ${sourceCoin.coinObjectId} (Balance: ${sourceCoin.balance}) as source.`);
                [coinToDeposit] = txb.splitCoins(txb.object(sourceCoin.coinObjectId), [depositAmountBigInt]);
            } else {
                // If no single coin is sufficient, try merging smaller coins (Sui >= 0.20.0)
                const availableBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
                if (availableBalance >= depositAmountBigInt) {
                    console.log(`Merging multiple coins to meet deposit amount.`);
                    // Merge all necessary coins into the first one, then split from it
                    const primaryCoin = coins[0];
                    const coinsToMerge = coins.slice(1); // Rest of the coins
                    txb.mergeCoins(txb.object(primaryCoin.coinObjectId), coinsToMerge.map(c => txb.object(c.coinObjectId)));
                    [coinToDeposit] = txb.splitCoins(txb.object(primaryCoin.coinObjectId), [depositAmountBigInt]);
                } else {
                    throw new Error(`Insufficient total balance (${formatBalance(availableBalance, decimals)} ${selectedToken.name}) across all coin objects.`);
                }
            }
        }

        console.log("Passing CoinType to post_collateral:", selectedDepositTokenInfo);
        txb.moveCall({
            target: `${PACKAGE_ID}::collateral::post_collateral`,
            typeArguments: [selectedDepositTokenInfo],
            arguments: [
                txb.object(accountObjectId),
                txb.object(accountStatsId),
                txb.object(PROGRAM_ID),
                coinToDeposit, // This is the Result<Coin<T>> from splitCoins
            ],
        });

        console.log("Transaction block prepared."); // Avoid logging full blockData if too large

        // Choose path: Dev Inspect or Sign & Execute
        if (ENABLE_DEV_INSPECT_DEPOSIT) {
            console.log("Attempting devInspectTransactionBlock...");
            try {
                const inspectResult = await client.devInspectTransactionBlock({
                    sender: account.address,
                    transactionBlock: txb,
                });
                console.log("devInspectTransactionBlock Result:", inspectResult); // Log less verbosely

                if (inspectResult.error) {
                     setNotification({
                        show: true,
                        message: `Dev Inspect Failed: ${inspectResult.error}. Check console for details.`,
                        type: 'error',
                    });
                } else {
                     setNotification({
                        show: true,
                        message: `Dev Inspect Succeeded (effects hash: ${inspectResult.effects.transactionDigest}). Check console.`,
                        type: 'info',
                    });
                     setDepositAmount("");
                }
                 setIsLoadingTx(false);
                 return;

            } catch (inspectError) {
                console.error('Error during devInspectTransactionBlock:', inspectError);
                setNotification({
                    show: true,
                    message: `Error during inspection: ${inspectError instanceof Error ? inspectError.message : String(inspectError)}`,
                    type: 'error',
                });
                setIsLoadingTx(false);
                return;
            }

        } else {
            // Sign and Execute Path
            console.log("Attempting signAndExecuteTransaction...");
            signAndExecuteTransaction(
                { transaction: txb },
                {
                    onSuccess: (result) => {
                        console.log('Collateral deposit successful!', result);
                        setNotification({
                            show: true,
                            message: `Successfully deposited ${depositAmount} ${selectedToken.name}.`,
                            type: 'success',
                            digest: result.digest,
                        });
                        setDepositAmount(""); // Clear input on success
                        // TODO: Trigger refetch of deposited balances
                    },
                    onError: (error) => {
                        console.error('Error depositing collateral:', error);
                        setNotification({
                            show: true,
                            message: `Error depositing collateral: ${error.message}`,
                            type: 'error',
                        });
                    },
                    onSettled: () => {
                        setIsLoadingTx(false);
                    }
                }
            );
        }

     } catch (error) {
         console.error('Error constructing deposit transaction:', error);
          setNotification({
            show: true,
            message: `Error preparing deposit: ${error instanceof Error ? error.message : String(error)}`,
            type: 'error',
        });
        setIsLoadingTx(false);
     }
  };

  // --- Withdraw Handler (Placeholder) ---
  const handleWithdraw = async () => {}


  // --- UI Helpers ---
  const getLeverageColor = (value: number, maxLeverage: number = 100): string => {
    const minLeverage = 1;
    const normalized = Math.max(0, Math.min(1, (value - minLeverage) / (maxLeverage - minLeverage)));
    const hue = (1 - normalized) * 120;
    return `hsl(${hue}, 100%, 50%)`;
  };

  // Prepare options for Select components
  const depositTokenOptions = supportedCollateral.map(token => ({
      value: token.fields.token_info,
      label: token.name
  }));

  // >>> MODIFIED: Filter withdraw options based on *deposited* non-zero balances <<<
  const withdrawTokenOptions = supportedCollateral
    .filter(token => {
        const balanceStr = userDepositedCollateral[token.fields.token_info];
        // Check if balance string exists, is not "Error", and parsed value > 0
        return balanceStr && balanceStr !== "Error" && parseFloat(balanceStr) > 0;
    })
    .map(token => ({
        value: token.fields.token_info,
        label: token.name
    }));

  const getSelectedTokenName = (tokenInfo: string): string => {
    return supportedCollateral.find(t => t.fields.token_info === tokenInfo)?.name || "Token";
  };

  // >>> MODIFIED: Use deposited collateral for validation <<<
  const selectedWithdrawTokenDepositedBalanceStr = userDepositedCollateral[selectedWithdrawTokenInfo];
  const selectedWithdrawTokenDepositedBalance = selectedWithdrawTokenDepositedBalanceStr && selectedWithdrawTokenDepositedBalanceStr !== "Error"
                                                ? parseFloat(selectedWithdrawTokenDepositedBalanceStr)
                                                : 0;
  const withdrawAmountNum = parseFloat(withdrawAmount || '0');
  const isWithdrawAmountValid = withdrawAmountNum > 0 && withdrawAmountNum <= selectedWithdrawTokenDepositedBalance;
  const depositAmountNum = parseFloat(depositAmount || '0');
  const isDepositAmountValid = depositAmountNum > 0; // Basic check


  // --- Render Logic ---
  return (
    <section className="card bg-backgroundOffset mt-4 border border-secondary relative">
      {/* Notification Popup */}
      {notification?.show && (
        <NotificationPopup
          message={notification.message}
          type={notification.type}
          digest={notification.digest}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Dev Inspect Mode Indicator */}
      {ENABLE_DEV_INSPECT_DEPOSIT && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded z-10">
              DEV INSPECT ACTIVE
          </div>
       )}

      {/* Account Loading Indicator */}
      {isLoadingCoreData && (
        <div className="p-4 text-center text-secondaryText">Loading account data...</div>
      )}

      {/* Create Account Section */}
      {!isLoadingCoreData && account && !accountObjectId && (
        <div className="p-4">
          {isLoadingTx && <p className="text-center text-secondaryText mt-2 text-sm">Processing...</p>}
          <button
            className="btn-action w-full"
            onClick={handleCreateAccount}
            disabled={!account || isLoadingTx}
          >
            {isLoadingTx ? "Creating..." : "Create Account"}
          </button>
          {!isLoadingTx && <p className="text-center text-secondaryText mt-2 text-sm">Create a Pismo Protocol account to start trading.</p>}
        </div>
      )}

      {/* Connect Wallet Prompt */}
      {!account && (
          <div className="p-4">
             <p className="text-center text-secondaryText mt-2 text-sm">Connect your wallet to begin.</p>
          </div>
      )}

      {/* Error loading stats ID */}
      {!isLoadingCoreData && account && accountObjectId && !accountStatsId && (
           <div className="p-4 text-center text-red-500">
               Failed to load account details. Please check console or try refreshing.
           </div>
      )}

      {/* Main Trading UI */}
      {!isLoadingCoreData && canDisplayTradingUI && (
        <>
          {/* Tabs */}
          <div className="flex gap-2 font-semibold text-center whitespace-nowrap">
            <button
              className={`position-button flex-1 ${activeTab === "Positions" ? "position-button-active" : "position-button-inactive"} px-4 py-3`}
              onClick={() => setActiveTab("Positions")}
            >
              Positions
            </button>
            <button
              className={`position-button flex-1 ${activeTab === "Collateral" ? "position-button-active" : "position-button-inactive"} px-4 py-3`}
              onClick={() => setActiveTab("Collateral")}
            >
              Collateral
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {/* Positions Tab */}
            {activeTab === "Positions" && (
              <div>
                <div className="flex gap-2 mb-6 max-sm:gap-2">
                  <button
                    className={`position-button flex-1 py-2 px-4 ${positionType === "Long" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gray-700 hover:bg-gray-600"} text-white font-bold`}
                    onClick={() => handlePositionClick("Long")}
                  >
                    Long
                  </button>
                  <button
                    className={`position-button flex-1 py-2 px-4 ${positionType === "Short" ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"} text-white font-bold`}
                    onClick={() => handlePositionClick("Short")}
                  >
                    Short
                  </button>
                </div>

                <div className="mb-6">
                  <label className="input-label block text-secondaryText mb-2" htmlFor="leverage-slider">
                    Leverage: <span className="font-semibold" style={{ color: getLeverageColor(leverage) }}>{leverage}x</span>
                  </label>
                  <Slider value={leverage} onChange={handleLeverageChange} />
                </div>

                <div className="mb-6">
                  <label className="input-label block text-secondaryText mb-2" htmlFor="amount-input">
                    Amount {/* TODO: Specify which token amount */}
                  </label>
                    <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                    <input
                      id="amount-input"
                      type="text"
                      className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.00"
                    />
                    {/* TODO: Add token selector for position */}
                    </div>
                </div>

                <button className="btn-action w-full mt-6" disabled> {/* TODO: Enable when position logic is added */}
                  Place Order {/* TODO: Add details like token */}
                </button>
              </div>
            )}

            {/* Collateral Tab */}
            {activeTab === "Collateral" && (
              <div>
                 <div className="flex gap-2 mb-6 max-sm:gap-2 pb-4">
                    <button
                        className={`position-button flex-1 ${collateralAction === "Deposit" ? "position-button-active" : "position-button-inactive"} py-2 px-4`}
                        onClick={() => setCollateralAction("Deposit")}
                    >
                        Deposit
                    </button>
                    <button
                        className={`position-button flex-1 ${collateralAction === "Withdraw" ? "position-button-active" : "position-button-inactive"} py-2 px-4`}
                         onClick={() => setCollateralAction("Withdraw")}
                    >
                        Withdraw
                    </button>
                </div>

                 {/* Loading/Error State for Collateral Config */}
                 {isLoadingCollateral && <p className="text-center text-secondaryText mb-4">Loading collateral types...</p>}
                 {collateralError && <p className="text-center text-red-500 mb-4">{collateralError}</p>}
                 {/* Loading State for Wallet Balances (shown in Deposit) - only on initial load */}
                 {collateralAction === "Deposit" && !isLoadingCollateral && !collateralError && !hasWalletBalancesLoadedOnce && isLoadingWalletBalances && <p className="text-center text-secondaryText mb-4">Loading wallet balances...</p>}
                 {/* Loading State for Deposited Balances (shown in Withdraw) - only on initial load */}
                 {collateralAction === "Withdraw" && !isLoadingCollateral && !collateralError && !hasDepositedCollateralLoadedOnce && isLoadingDepositedCollateral && <p className="text-center text-secondaryText mb-4">Loading deposited balances...</p>}
                 {/* Error State for Deposited Balances (shown in Withdraw) */}
                 {collateralAction === "Withdraw" && !isLoadingCollateral && !collateralError && depositedCollateralError && <p className="text-center text-red-500 mb-4">{depositedCollateralError}</p>}


                {/* Deposit Section */}
                {collateralAction === "Deposit" && !isLoadingCollateral && !collateralError && (
                    <div className="space-y-4">
                        {supportedCollateral.length === 0 ? (
                             <p className="text-secondaryText text-center">No supported collateral types found.</p>
                        ) : (
                         <>
                            <div>
                                <label className="input-label block text-secondaryText mb-2" htmlFor="token-select">
                                    Token
                                </label>
                                <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                    <Select
                                        options={depositTokenOptions}
                                        selected={selectedDepositTokenInfo}
                                        onChange={handleDepositTokenChange}
                                        className="input-field bg-transparent border-none focus:outline-none w-full text-primaryText appearance-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="input-label block text-secondaryText mb-2" htmlFor="deposit-amount-input">
                                    Amount
                                    {/* Show WALLET balance for deposit */}
                                    {selectedDepositTokenInfo &&
                                        <span className="text-xs text-gray-400 ml-2">
                                            Wallet Balance: {userWalletBalances[selectedDepositTokenInfo] || '0.0'}
                                        </span>
                                    }
                                </label>
                                <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                    <input
                                        id="deposit-amount-input"
                                        type="text"
                                        className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent"
                                        value={depositAmount}
                                        onChange={handleDepositAmountChange}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <button
                                className="btn-action w-full mt-6"
                                onClick={handleDeposit}
                                disabled={!selectedDepositTokenInfo || !isDepositAmountValid || isLoadingTx || isFetchingStatsId || isLoadingWalletBalances}
                            >
                                {isLoadingTx
                                    ? (ENABLE_DEV_INSPECT_DEPOSIT ? "Inspecting..." : "Depositing...")
                                    : (ENABLE_DEV_INSPECT_DEPOSIT ? `Inspect Deposit ${getSelectedTokenName(selectedDepositTokenInfo)}` : `Deposit ${getSelectedTokenName(selectedDepositTokenInfo)}`)
                                }
                            </button>
                        </>
                        )}
                    </div>
                )}

                {/* Withdraw Section */}
                {/* >>> MODIFIED: Use userDepositedCollateral and related states <<< */}
                {collateralAction === "Withdraw" && !isLoadingCollateral && !collateralError && !depositedCollateralError && (
                    <div className="space-y-4">
                        <h3 className="input-label text-lg font-semibold text-secondaryText mb-3">Your Deposited Collateral</h3>
                        {/* Use withdrawTokenOptions length (derived from userDepositedCollateral) */}
                        {withdrawTokenOptions.length === 0 ? (
                            <p className="text-secondaryText">No collateral deposited.</p>
                        ) : (
                            <div className="space-y-2 border-y border-gray-700 py-3 mb-4">
                                {/* Filter based on positive deposited balance */}
                                {supportedCollateral
                                    .filter(token => {
                                        const balanceStr = userDepositedCollateral[token.fields.token_info];
                                        return balanceStr && balanceStr !== "Error" && parseFloat(balanceStr) > 0;
                                    })
                                    .map(token => (
                                    <div key={token.fields.token_info} className="flex items-center justify-between gap-4 px-1">
                                        <div className="flex items-center gap-2">
                                            {/* Add TokenIcon if available */}
                                            <span className="font-medium text-primaryText">{token.name}</span>
                                        </div>
                                        {/* Display balance from userDepositedCollateral */}
                                        <span className="text-sm text-secondaryText">{userDepositedCollateral[token.fields.token_info] || '0.0'}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {withdrawTokenOptions.length > 0 && (
                            <>
                                <div>
                                    <label className="input-label block text-secondaryText mb-2" htmlFor="withdraw-token-select">
                                        Token
                                    </label>
                                    <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                        {/* Options are already filtered based on deposited balance */}
                                        <Select
                                            options={withdrawTokenOptions}
                                            selected={selectedWithdrawTokenInfo}
                                            onChange={handleWithdrawTokenChange}
                                            className="input-field bg-transparent border-none focus:outline-none w-full text-primaryText appearance-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="input-label block text-secondaryText mb-2" htmlFor="withdraw-amount-input">
                                        Amount
                                        {/* Show DEPOSITED balance */}
                                        {selectedWithdrawTokenInfo &&
                                            <span className="text-xs text-gray-400 ml-2">
                                                Deposited: {userDepositedCollateral[selectedWithdrawTokenInfo] || '0.0'}
                                            </span>
                                        }
                                    </label>
                                    <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                        <input
                                            id="withdraw-amount-input"
                                            type="text"
                                            className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent"
                                            value={withdrawAmount}
                                            onChange={handleWithdrawAmountInputChange}
                                            placeholder="0.00"
                                        />
                                        {/* Max button uses DEPOSITED balance */}
                                        {selectedWithdrawTokenDepositedBalance > 0 && (
                                            <button
                                                onClick={() => setWithdrawAmount(String(selectedWithdrawTokenDepositedBalanceStr))} // Use the formatted string balance
                                                className="text-accent hover:text-accentHover text-sm font-medium"
                                                type="button"
                                            >
                                                Max
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <button
                                    className="btn-action w-full mt-6"
                                    onClick={handleWithdraw} // Added withdraw handler call
                                    // Disable button based on deposited balance validity and loading states
                                    disabled={!selectedWithdrawTokenInfo || !isWithdrawAmountValid || isLoadingTx || isFetchingStatsId || isLoadingDepositedCollateral}
                                >
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