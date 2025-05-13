import React, { useState, useEffect, useRef } from 'react';
import { PositionData } from '@/types';
import { pythPriceFeedService } from '@/utils/pythPriceFeed'; // Import the service
import { useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit"; // Added
import { SuiClient } from '@mysten/sui/client'; // Added
import { SuiPythClient } from '@pythnetwork/pyth-sui-js'; // Added
import NotificationPopup from '../common/NotificationPopup'; // Added
import { 
    closePosition, 
    PositionDataForClose, 
    ClosePositionParams, 
    ClosePositionCallbacks 
} from '@/lib/transactions/closePosition'; // Added
import type { MinimalAccountInfo, NotificationState, SupportedCollateralToken } from '@/lib/transactions/depositCollateral'; // Added

// Hardcoded Account ID for now - THIS WILL BE REMOVED
// const ACCOUNT_ID = "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865"; // Remove this line
const INDEXER_URL_CONST = process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3001"; // Fallback for safety, renamed
const PACKAGE_ID_CONST = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID; // Added
const PROGRAM_ID_CONST = process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID; // Added
const PYTH_STATE_OBJECT_ID_CONST = process.env.NEXT_PUBLIC_PYTH_STATE_OBJECT_ID; // Added
const WORMHOLE_STATE_ID_CONST = process.env.NEXT_PUBLIC_WORMHOLE_STATE_OBJECT_ID; // Added
const HERMES_ENDPOINT_CONST = process.env.NEXT_PUBLIC_HERMES_ENDPOINT; // Added

// --- Define Props Interface ---
interface CurrentPositionsProps {
    // account: MinimalAccountInfo | null; // Removed, as CurrentPositions will use accountObjectId and accountStatsId directly for transactions
    accountId: string | null; // Kept for fetching positions (user's wallet address, which might be what /v0/:account_id/positions expects if not protocol ID)
    accountObjectId: string | null; // Added: Protocol-specific Account object ID
    accountStatsId: string | null; // Added: Protocol-specific AccountStats object ID
    availableAssets: import('./AssetSelector').SelectableMarketAsset[];
    supportedCollateral: SupportedCollateralToken[]; 
}

// --- Helper Functions ---
const parseAmountString = (amountStr: string): number => {
    // Allow parsing potentially negative inputs during validation, but clamp later
    return parseFloat(amountStr) || 0;
};

const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) {
        return "$ --";
    }
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatAmount = (amountStr: string | undefined | null, decimals: number): string => {
    if (!amountStr) return "0.00";
    try {
        const amount = parseFloat(amountStr);
        const value = amount / (10 ** decimals);
        // Adjust formatting as needed, e.g., minimum/maximum fraction digits
        return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    } catch (e) {
        console.error("Error formatting amount:", e);
        return "Error";
    }
};

// Helper to get decimals for a position
const getPositionDecimals = (position: PositionData, availableAssets: import('./AssetSelector').SelectableMarketAsset[]): number => {
    return availableAssets[position.supported_positions_token_i]?.decimals ?? 6;
};

// Update calculatePositionValue to accept decimals
const calculatePositionValue = (position: PositionData, livePrice: number | undefined, decimals: number): number | null => {
    if (livePrice === undefined || !position.amount) {
        return null;
    }
    try {
        const amount = parseFloat(position.amount) / (10 ** decimals);
        const leverage = position.leverage_multiplier ? parseFloat(position.leverage_multiplier) : 1;
        const value = amount * livePrice * leverage;
        return value;
    } catch (e) {
        console.error("Error calculating position value:", e);
        return null;
    }
};

const calculatePercentChange = (
    entryPriceStr: string,
    entryDecimals: number,
    currentPrice: number | undefined,
    positionType: "Long" | "Short"
): number | null => {
    if (!entryPriceStr || currentPrice === undefined) return null;
    const entryPrice = parseFloat(entryPriceStr) / (10 ** entryDecimals);
    if (!entryPrice || isNaN(entryPrice) || entryPrice === 0) return null;
    // For Long: (current - entry) / entry; For Short: (entry - current) / entry
    const rawChange = positionType === "Long"
        ? (currentPrice - entryPrice) / entryPrice
        : (entryPrice - currentPrice) / entryPrice;
    return rawChange * 100;
};

// --- Slider Component ---
const Slider: React.FC<{ value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }> = ({ value, onChange, min = 0, max = 100, step = 1 }) => {
    return (
        <input 
            type="range" 
            min={min} 
            max={max}
            step={step}
            value={value} 
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
        />
    );
};

// Update component to use props
const CurrentPositions: React.FC<CurrentPositionsProps> = ({ /*account,*/ accountId, accountObjectId, accountStatsId, availableAssets, supportedCollateral }) => {
    const [positions, setPositions] = useState<PositionData[]>([]);
    const [livePrices, setLivePrices] = useState<Record<string, number | undefined>>({}); // Allow undefined for loading state
    const [isLoadingData, setIsLoadingData] = useState<boolean>(true); // Renamed from isLoading
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
    const [modalCloseAmount, setModalCloseAmount] = useState<string>("");
    const [closePercentage, setClosePercentage] = useState<number>(100);
    const [modalAmountError, setModalAmountError] = useState<string | null>(null); // State for modal input error
    const subscribedFeedIdsRef = useRef<Set<string>>(new Set());

    // Added state for transactions and notifications
    const [isLoadingTx, setIsLoadingTx] = useState<boolean>(false);
    const [notification, setNotification] = useState<NotificationState>(null);

    const suiClient = useSuiClient();
    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    
    // Initialize Pyth client - ensure PYTH_STATE_OBJECT_ID_CONST and WORMHOLE_STATE_ID_CONST are defined
    // This initialization might be better if pythClient is passed as a prop if already initialized in a parent.
    const pythClient = PYTH_STATE_OBJECT_ID_CONST && WORMHOLE_STATE_ID_CONST 
        ? new SuiPythClient(suiClient, PYTH_STATE_OBJECT_ID_CONST, WORMHOLE_STATE_ID_CONST)
        : null;

    useEffect(() => {
        let isInitialFetch = true; // Flag to distinguish initial load from interval refreshes

        const fetchPositionsAndUpdateState = async () => {
            if (!accountObjectId) { 
                setPositions([]);
                setIsLoadingData(false); // Ensure loading is off
                setError(null);
                isInitialFetch = true; // Reset for next time accountObjectId is available
                return;
            }

            if (isInitialFetch) {
                setIsLoadingData(true);
                setError(null);
            }

            try {
                const accountIdForUrl = accountObjectId.startsWith('0x') 
                    ? accountObjectId 
                    : '0x' + accountObjectId;
                
                const response = await fetch(`${INDEXER_URL_CONST}/v0/${accountIdForUrl}/positions`); 
                if (!response.ok) {
                    const errorMsg = `HTTP error! status: ${response.status}`;
                    if (isInitialFetch) {
                        // For initial load, throw to be caught and set main error state
                        throw new Error(errorMsg);
                    } else {
                        // For background refresh errors, log and keep stale data
                        console.warn(`Background position refresh failed: ${errorMsg}`);
                        return; // Do not update positions or error state
                    }
                }
                const data: PositionData[] = await response.json();
                setPositions(data);
                setError(null); // Clear any error on successful data fetch
            } catch (err) {
                console.error("Failed to fetch positions:", err);
                if (isInitialFetch) {
                    setError(err instanceof Error ? err.message : "An unknown error occurred");
                    setPositions([]); // Clear positions on critical error during initial load
                } else {
                    // Log other types of errors during background refresh
                    console.warn("Background position refresh error:", err);
                    // Keep stale data, do not update main error state
                }
            } finally {
                if (isInitialFetch) {
                    setIsLoadingData(false);
                    isInitialFetch = false; // Subsequent calls are background refreshes
                }
            }
        };

        fetchPositionsAndUpdateState(); // Initial fetch
        const intervalId = setInterval(fetchPositionsAndUpdateState, 2000); // Fetch every 2 seconds

        return () => {
            clearInterval(intervalId); // Clear interval on cleanup
        };
    }, [accountObjectId]); // Update dependency array to use accountObjectId

    useEffect(() => {
        const requiredFeedIds = new Set(positions.map(p => {
            const feedId = p.price_feed_id_bytes;
            return feedId.startsWith('0x') ? feedId : `0x${feedId}`;
        }).filter(id => id && id !== '0x'));

        const currentSubscribedIds = subscribedFeedIdsRef.current;

        requiredFeedIds.forEach(feedId => {
            if (!currentSubscribedIds.has(feedId)) {
                setLivePrices(prev => ({ ...prev, [feedId]: prev[feedId] ?? undefined }));
                pythPriceFeedService.subscribe(feedId, (price) => {
                    if (requiredFeedIds.has(feedId)) {
                        setLivePrices(prevPrices => ({
                            ...prevPrices,
                            [feedId]: price
                        }));
                    }
                }).then(subscribed => {
                    if (subscribed) {
                        currentSubscribedIds.add(feedId);
                        pythPriceFeedService.getLatestPrice(feedId).then(initialData => {
                            if (initialData && requiredFeedIds.has(feedId)) {
                                setLivePrices(prevPrices => ({
                                    ...prevPrices,
                                    [feedId]: initialData.price
                                }));
                            } else if (!initialData) {
                                console.warn(`[CurrentPositions] Failed to get initial price for ${feedId}`);
                            }
                        }).catch(err => {
                            console.error(`[CurrentPositions] Error fetching initial price for ${feedId}:`, err);
                        });
                    } else {
                        if (!livePrices[feedId]) {
                            pythPriceFeedService.getLatestPrice(feedId).then(initialData => {
                                if (initialData && requiredFeedIds.has(feedId)) {
                                    setLivePrices(prevPrices => ({ ...prevPrices, [feedId]: initialData.price }));
                                }
                            });
                        }
                    }
                }).catch(err => {
                    console.error(`[CurrentPositions] Error during subscription process for ${feedId}:`, err);
                });
            }
        });

        currentSubscribedIds.forEach(feedId => {
            if (!requiredFeedIds.has(feedId)) {
                pythPriceFeedService.unsubscribe(feedId);
                currentSubscribedIds.delete(feedId);
                setLivePrices(prev => {
                    const newState = { ...prev };
                    delete newState[feedId];
                    return newState;
                });
            }
        });

        subscribedFeedIdsRef.current = new Set(currentSubscribedIds);

        return () => {
            subscribedFeedIdsRef.current.forEach(feedId => {
                pythPriceFeedService.unsubscribe(feedId);
            });
            subscribedFeedIdsRef.current.clear();
        };
    }, [positions]);

    const positionToClose = closingPositionId ? positions.find(p => p.position_id === closingPositionId) : null;
    // Calculate total position amount considering decimals
    const modalDecimals = positionToClose ? getPositionDecimals(positionToClose, availableAssets) : 6;
    const totalPositionAmount = positionToClose ? (parseFloat(positionToClose.amount) / (10 ** modalDecimals)) : 0;

    // Calculate the current total value of the position being closed
    const positionToCloseLivePrice = positionToClose ? livePrices[positionToClose.price_feed_id_bytes.startsWith('0x') ? positionToClose.price_feed_id_bytes : `0x${positionToClose.price_feed_id_bytes}`] : undefined;
    const positionToCloseLiveValue = positionToClose ? calculatePositionValue(positionToClose, positionToCloseLivePrice, modalDecimals) : null;

    // Calculate the value of the portion being closed
    const closingValue = positionToCloseLiveValue !== null ? positionToCloseLiveValue * (closePercentage / 100) : null;

    const openModal = (positionId: string) => {
        const position = positions.find(p => p.position_id === positionId);
        if (!position) return;
        const decimals = getPositionDecimals(position, availableAssets);
        const fullAmountDecimal = parseFloat(position.amount) / (10 ** decimals);

        setClosingPositionId(positionId);
        setClosePercentage(100);
        setModalCloseAmount(fullAmountDecimal.toFixed(decimals));
        setIsModalOpen(true);
        setModalAmountError(null);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setClosingPositionId(null);
        setModalCloseAmount("");
        setClosePercentage(100);
        setModalAmountError(null); // Reset error on close
    };

    const handleModalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputAmountStr = e.target.value;
        setModalCloseAmount(inputAmountStr);
        setModalAmountError(null); // Clear error initially

        // Allow only numbers and a single decimal point
        if (inputAmountStr && !/^-?\d*\.?\d*$/.test(inputAmountStr)) {
             setModalAmountError("Please enter a valid number.");
             setClosePercentage(0); // Reset percentage if input is invalid
             return;
        }

        const inputAmountNum = parseFloat(inputAmountStr);

        // Check for NaN explicitly after regex allows partial inputs like "." or "-"
        if (isNaN(inputAmountNum) && inputAmountStr !== "" && inputAmountStr !== "." && inputAmountStr !== "-") {
            setModalAmountError("Please enter a valid number.");
            setClosePercentage(0);
            return;
        }

        if (!isNaN(inputAmountNum)) {
             // Prevent negative numbers
            if (inputAmountNum < 0) {
                setModalAmountError("Amount cannot be negative.");
                setClosePercentage(0); // Reset percentage for negative input
            } else if (inputAmountNum > totalPositionAmount) {
                // Check if input exceeds total position amount
                setModalAmountError("Amount cannot exceed position size.");
                setClosePercentage(100); // Set percentage to 100 if input exceeds max
                // Optionally, cap the input value to the max
                // setModalCloseAmount(totalPositionAmount.toFixed(AMOUNT_DECIMALS));
            } else if (totalPositionAmount > 0) {
                const percentage = Math.max(0, Math.min(100, (inputAmountNum / totalPositionAmount) * 100));
                setClosePercentage(percentage);
            } else {
                setClosePercentage(0); // Handle case where totalPositionAmount is 0
            }
        } else if (inputAmountStr === "") {
            setClosePercentage(0); // Set percentage to 0 if input is empty
        }
    };

    const handleSliderChange = (percentage: number) => {
        setClosePercentage(percentage);
        setModalAmountError(null);
        if (totalPositionAmount > 0) {
            const calculatedAmount = (totalPositionAmount * percentage) / 100;
            const formattedAmount = calculatedAmount.toFixed(modalDecimals);
            setModalCloseAmount(formattedAmount);
        } else {
            setModalCloseAmount("0");
        }
    };

    const handleConfirmClose = async () => { // Made async
        if (!positionToClose) {
            setNotification({ show: true, message: "No position selected for closing.", type: 'error' });
            return;
        }

        // Log the values being checked
        console.log("Checking required data for closePosition:", {
            // account, // Removed from log
            accountObjectId,
            accountStatsId,
            PACKAGE_ID_CONST,
            PROGRAM_ID_CONST,
            PYTH_STATE_OBJECT_ID_CONST,
            WORMHOLE_STATE_ID_CONST,
            HERMES_ENDPOINT_CONST,
            pythClient: !!pythClient, // Log boolean to see if it exists
        });

        if (/*!account ||*/ !accountObjectId || !accountStatsId || !PACKAGE_ID_CONST || !PROGRAM_ID_CONST || !PYTH_STATE_OBJECT_ID_CONST || !WORMHOLE_STATE_ID_CONST || !HERMES_ENDPOINT_CONST || !pythClient) {
            setNotification({ show: true, message: "Required configuration or account details are missing.", type: 'error' });
            return;
        }

        const positionDataForClose: PositionDataForClose = {
            position_id: positionToClose.position_id,
            price_feed_id_bytes: positionToClose.price_feed_id_bytes.startsWith('0x') 
                ? positionToClose.price_feed_id_bytes 
                : '0x' + positionToClose.price_feed_id_bytes,
        };

        const params: ClosePositionParams = {
            accountObjectId: accountObjectId!, // Assert non-null as it's checked above
            accountStatsId: accountStatsId!,   // Assert non-null
            packageId: PACKAGE_ID_CONST!,
            programId: PROGRAM_ID_CONST!,
            pythStateObjectId: PYTH_STATE_OBJECT_ID_CONST!,
            wormholeStateId: WORMHOLE_STATE_ID_CONST!,
            hermesEndpoint: HERMES_ENDPOINT_CONST!,
            pythClient,
            indexerUrl: INDEXER_URL_CONST,
            positionToClose: positionDataForClose,
            supportedCollateral, // Passed from props
            suiClient,
            signAndExecuteTransaction,
        };

        const callbacks: ClosePositionCallbacks = {
            setNotification,
            setIsLoadingTx,
            onSuccess: (digest) => {
                console.log(`Position closed successfully with digest: ${digest}`);
                // Optionally, trigger a refresh of positions here
                // fetchPositionsAndUpdateState(); // This function is defined in useEffect, might need to lift it or pass a refresh callback
                closeModal(); // Close modal on success
            }
        };

        await closePosition(params, callbacks);
    };

    // Conditional rendering if accountObjectId is not available
    if (!accountObjectId) {
        return (
            <section className="mt-8">
                <h2 className="text-xl font-semibold text-primaryText mb-4 pl-4">Your Positions</h2>
                <p className="text-secondaryText text-center py-4">
                    Please connect your wallet and ensure your account is loaded to view positions.
                </p>
            </section>
        );
    }

    return (
        <section className="mt-8">
            {notification?.show && (
                <NotificationPopup
                    message={notification.message}
                    type={notification.type}
                    digest={notification.digest}
                    onClose={() => setNotification(null)}
                />
            )}
            <h2 className="text-xl font-semibold text-primaryText mb-4 pl-4">Your Positions</h2>
            <div className="space-y-4">
                {isLoadingData ? (
                    <p className="text-secondaryText text-center py-4">Loading positions...</p>
                ) : error ? (
                    <p className="text-red-500 text-center py-4">Error loading positions: {error}</p>
                ) : positions.length === 0 ? (
                    <p className="text-secondaryText text-center py-4">You have no open positions.</p>
                ) : (
                    positions.map((position) => {
                        const formattedFeedId = position.price_feed_id_bytes.startsWith('0x')
                            ? position.price_feed_id_bytes
                            : `0x${position.price_feed_id_bytes}`;
                        const livePrice = livePrices[formattedFeedId];
                        const decimals = getPositionDecimals(position, availableAssets);
                        const liveValue = calculatePositionValue(position, livePrice, decimals);
                        const formattedAmount = formatAmount(position.amount, decimals);
                        // Calculate percent change
                        const percentChange = calculatePercentChange(
                            position.entry_price,
                            position.entry_price_decimals,
                            livePrice,
                            position.position_type
                        );
                        // Format entry and current price
                        const entryPriceFormatted = position.entry_price
                            ? (parseFloat(position.entry_price) / (10 ** position.entry_price_decimals)).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })
                            : '$--';
                        const currentPriceFormatted =
                            livePrice !== undefined
                                ? livePrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })
                                : '$--';
                        // Color for percent change
                        const percentBoxColor = percentChange === null
                            ? 'bg-gray-700 text-secondaryText'
                            : percentChange >= 0
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400'
                                : 'bg-red-500/20 text-red-400 border border-red-400';

                        // Find the asset name using supported_positions_token_i
                        const asset = availableAssets[position.supported_positions_token_i];
                        const assetName = asset ? asset.displayName : `Token Index ${position.supported_positions_token_i}`;

                        return (
                            <div key={position.position_id} className="card bg-backgroundOffset p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className='w-6 h-6 bg-gray-600 rounded-full'></div>
                                    <span className="font-semibold text-primaryText text-lg">
                                        {assetName}
                                    </span>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${position.position_type === 'Long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {position.position_type}
                                    </span>
                                </div>

                                {/* Percent Change Box */}
                                <div className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg text-sm font-semibold min-w-[110px] ${percentBoxColor}`}>
                                    <span>
                                        {percentChange === null ? '--' : `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`}
                                    </span>
                                    <span className="text-xs font-normal text-secondaryText mt-1">P/L</span>
                                </div>

                                <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                                    <div>
                                        <span className="text-secondaryText block">Value</span>
                                        <span className="text-primaryText font-medium">
                                            {formatCurrency(liveValue)}
                                            {livePrice === undefined && <span className="text-xs text-secondaryText"> (Loading...)</span>}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-secondaryText block">Leverage</span>
                                        <span className="text-primaryText font-medium">{position.leverage_multiplier}x</span>
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                        <span className="text-secondaryText block">Amount</span>
                                        <span className="text-primaryText font-medium">{formattedAmount}</span>
                                    </div>
                                    {/* Entry and Current Price */}
                                    <div className="col-span-2 sm:col-span-3 flex gap-4 mt-2">
                                        <span className="text-xs text-secondaryText">Entry: <span className="text-primaryText font-medium">{entryPriceFormatted}</span></span>
                                        <span className="text-xs text-secondaryText">Current: <span className="text-primaryText font-medium">{currentPriceFormatted}</span></span>
                                    </div>
                                </div>

                                <button
                                    className="btn-action text-sm py-2 px-4 flex-shrink-0 w-full sm:w-auto"
                                    onClick={() => openModal(position.position_id)}
                                >
                                    Close
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {isModalOpen && positionToClose && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
                >
                    <div
                        className="card bg-backgroundOffset p-6 shadow-xl w-full max-w-md border border-secondary"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-primaryText mb-4">
                            Close {positionToClose.supported_positions_token_i} {positionToClose.position_type} Position
                        </h3>

                        <div className="mb-1">
                            <label className="input-label block text-secondaryText mb-2" htmlFor="modal-close-amount">
                                {/* Display max amount with correct decimals */}
                                Amount to Close (Max: {totalPositionAmount.toFixed(modalDecimals)})
                            </label>
                            <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                <input
                                    id="modal-close-amount"
                                    type="text" // Use text to allow intermediate states like "."
                                    inputMode="decimal" // Hint for mobile keyboards
                                    className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent"
                                    value={modalCloseAmount}
                                    onChange={handleModalAmountChange}
                                    placeholder={`0.${'0'.repeat(modalDecimals)}`} // Dynamic placeholder based on decimals
                                />
                            </div>
                            {modalAmountError && (
                                <p className="text-red-500 text-xs mt-1">{modalAmountError}</p>
                            )}
                        </div>

                        <div className="mb-4 mt-3">
                            <label className="input-label block text-secondaryText mb-2">
                                Percentage: <span className="text-primaryText font-medium">{closePercentage.toFixed(0)}%</span>
                            </label>
                            <Slider
                                value={closePercentage}
                                onChange={handleSliderChange}
                            />
                            {/* Display the calculated closing value */}
                            <div className="text-sm text-secondaryText mt-2">
                                {/* Ensure closingValue calculation uses the parsed modal amount */}
                                Closing Value: <span className="text-primaryText font-medium">{formatCurrency(positionToCloseLiveValue !== null ? positionToCloseLiveValue * (closePercentage / 100) : null)}</span>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-6">
                            <button
                                className="btn-secondary flex-1 py-2 px-4"
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-action flex-1 py-2 px-4"
                                onClick={handleConfirmClose}
                                // Disable confirm if there's an error, amount is empty, zero, negative, or exceeds max (redundant check, but safe)
                                disabled={isLoadingTx || !positionToClose } // Simplified: only disable if tx in progress or no position
                            >
                                {isLoadingTx ? "Processing..." : "Confirm Full Close"} {/* Button text updated for clarity */}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default CurrentPositions;