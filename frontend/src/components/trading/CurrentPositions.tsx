import React, { useState, useEffect, useRef } from 'react';
import { PositionData } from '@/types';
import { pythPriceFeedService } from '@/utils/pythPriceFeed'; // Import the service

// Hardcoded Account ID for now - THIS WILL BE REMOVED
// const ACCOUNT_ID = "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865"; // Remove this line
const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:3001"; // Fallback for safety

// --- Define Props Interface ---
interface CurrentPositionsProps {
    accountId: string | null;
    availableAssets: import('./AssetSelector').SelectableMarketAsset[];
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
    positionType: "Long" | "Short",
    leverageMultiplier: string
): number | null => {
    if (!entryPriceStr || currentPrice === undefined) return null;
    const entryPrice = parseFloat(entryPriceStr) / (10 ** entryDecimals);
    if (!entryPrice || isNaN(entryPrice) || entryPrice === 0) return null;
    // For Long: (current - entry) / entry; For Short: (entry - current) / entry
    const rawChange = positionType === "Long"
        ? (currentPrice - entryPrice) / entryPrice
        : (entryPrice - currentPrice) / entryPrice;
    return rawChange * 100 * parseInt(leverageMultiplier, 10);
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
const CurrentPositions: React.FC<CurrentPositionsProps> = ({ accountId, availableAssets }) => {
    const [positions, setPositions] = useState<PositionData[]>([]);
    const [livePrices, setLivePrices] = useState<Record<string, number | undefined>>({}); // Allow undefined for loading state
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
    const [modalCloseAmount, setModalCloseAmount] = useState<string>("");
    const [closePercentage, setClosePercentage] = useState<number>(100);
    const [modalAmountError, setModalAmountError] = useState<string | null>(null); // State for modal input error
    const subscribedFeedIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        let isInitialFetch = true; // Flag to distinguish initial load from interval refreshes

        const fetchPositionsAndUpdateState = async () => {
            if (!accountId) {
                setPositions([]);
                setIsLoading(false); // Ensure loading is off
                setError(null);
                isInitialFetch = true; // Reset for next time accountId is available
                return;
            }

            if (isInitialFetch) {
                setIsLoading(true);
                setError(null);
            }

            try {
                const response = await fetch(`${INDEXER_URL}/v0/${accountId}/positions`);
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
                    setIsLoading(false);
                    isInitialFetch = false; // Subsequent calls are background refreshes
                }
            }
        };

        fetchPositionsAndUpdateState(); // Initial fetch
        const intervalId = setInterval(fetchPositionsAndUpdateState, 2000); // Fetch every 2 seconds

        return () => {
            clearInterval(intervalId); // Clear interval on cleanup
        };
    }, [accountId]); // Re-run effect if accountId changes

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

    const handleConfirmClose = () => {
        const closeAmountBaseUnits = Math.round(parseFloat(modalCloseAmount) * (10 ** modalDecimals));
        if (isNaN(closeAmountBaseUnits) || closeAmountBaseUnits < 0 || (parseFloat(modalCloseAmount) > 0 && closeAmountBaseUnits === 0)) {
             console.error("Invalid amount calculated for closing:", modalCloseAmount, closeAmountBaseUnits);
             setModalAmountError("Invalid closing amount calculated.");
             return;
        }
        // TODO: Implement actual transaction submission using closeAmountBaseUnits
        closeModal();
    };

    // Conditional rendering if accountId is not available
    if (!accountId) {
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
            <h2 className="text-xl font-semibold text-primaryText mb-4 pl-4">Your Positions</h2>
            <div className="space-y-4">
                {isLoading ? (
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
                            position.position_type,
                            position.leverage_multiplier
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

                        // Calculate P/L display string and color
                        let plDisplayString = "N/A";
                        let plColorClass = "text-secondaryText"; // Default color for N/A or zero P/L
                        const currentLiveValueFormatted = formatCurrency(liveValue); // Handles null/NaN to "$ --"

                        // Only attempt to calculate and show P/L if the liveValue itself is a valid number.
                        if (livePrice !== undefined && liveValue !== null && !isNaN(liveValue)) {
                            if (position.entry_price && position.amount) {
                                const entryPriceNumeric = parseFloat(position.entry_price) / (10 ** position.entry_price_decimals);
                                if (!isNaN(entryPriceNumeric)) {
                                    const entryValue = calculatePositionValue(position, entryPriceNumeric, decimals);
                                    if (entryValue !== null && !isNaN(entryValue)) {
                                        const rawDelta = liveValue - entryValue;
                                        
                                        let effectivePL = rawDelta;
                                        if (position.position_type === "Short") {
                                            effectivePL = -rawDelta;
                                        }

                                        const formattedPL = formatCurrency(effectivePL); // Returns "$X.YZ", "-$X.YZ", or "$ --"
                                        
                                        if (formattedPL === "$ --") { // Indicates effectivePL was null/NaN
                                            plDisplayString = "N/A";
                                            plColorClass = "text-secondaryText";
                                        } else if (effectivePL > 0) {
                                            plDisplayString = `+${formattedPL}`; // e.g., +$10.00
                                            plColorClass = "text-emerald-400";
                                        } else if (effectivePL < 0) {
                                            plDisplayString = formattedPL; // e.g., -$5.00 (formatCurrency handles the sign)
                                            plColorClass = "text-red-400";
                                        } else { // effectivePL is 0
                                            plDisplayString = formattedPL; // e.g., $0.00
                                            plColorClass = "text-secondaryText"; 
                                        }
                                    }
                                    // If entryValue is null/NaN, plDisplayString remains "N/A", plColorClass remains "text-secondaryText"
                                }
                                // If entryPriceNumeric is NaN, plDisplayString remains "N/A", plColorClass remains "text-secondaryText"
                            }
                            // If no entry_price or amount, plDisplayString remains "N/A", plColorClass remains "text-secondaryText"
                        }
                        // If livePrice is undefined or liveValue is null/NaN, 
                        // currentLiveValueFormatted is "$ --", plDisplayString is "N/A", plColorClass is "text-secondaryText"

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
                                </div>

                                <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                                    <div>
                                        <span className="text-secondaryText block">Gain/Loss</span>
                                        <span className="font-medium">
                                            <span className={`${plColorClass}`}>{plDisplayString}</span>
                                            <span className="text-xs text-primaryText ml-1">({currentLiveValueFormatted})</span>
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
                                disabled={!!modalAmountError || !modalCloseAmount || parseFloat(modalCloseAmount) <= 0 || parseFloat(modalCloseAmount) > totalPositionAmount || isLoading}
                            >
                                Confirm Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default CurrentPositions;