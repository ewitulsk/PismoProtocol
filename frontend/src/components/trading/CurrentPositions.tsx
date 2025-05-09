import React, { useState, useEffect, useRef } from 'react';
import { PositionData } from '@/types';
import { pythPriceFeedService } from '@/utils/pythPriceFeed'; // Import the service

// Hardcoded Account ID for now - THIS WILL BE REMOVED
// const ACCOUNT_ID = "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865"; // Remove this line
const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:3001"; // Fallback for safety

// --- Define Props Interface ---
interface CurrentPositionsProps {
    accountId: string | null;
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

const calculatePositionValue = (position: PositionData, livePrice: number | undefined): number | null => {
    // Assume amount_decimals is 6 as per user request
    const amountDecimals = 6; // Use a constant for clarity

    if (livePrice === undefined || !position.amount) {
        return null;
    }
    try {
        // Use the correctly calculated decimal amount
        const amount = parseFloat(position.amount) / (10 ** amountDecimals);
        const value = amount * livePrice;
        return value;
    } catch (e) {
        console.error("Error calculating position value:", e);
        return null;
    }
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
const CurrentPositions: React.FC<CurrentPositionsProps> = ({ accountId }) => {
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

    // Define decimals constant, assuming 6 based on previous context
    const AMOUNT_DECIMALS = 6;

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
    const totalPositionAmount = positionToClose ? (parseFloat(positionToClose.amount) / (10 ** AMOUNT_DECIMALS)) : 0;

    // Calculate the current total value of the position being closed
    const positionToCloseLivePrice = positionToClose ? livePrices[positionToClose.price_feed_id_bytes.startsWith('0x') ? positionToClose.price_feed_id_bytes : `0x${positionToClose.price_feed_id_bytes}`] : undefined;
    const positionToCloseLiveValue = positionToClose ? calculatePositionValue(positionToClose, positionToCloseLivePrice) : null;

    // Calculate the value of the portion being closed
    const closingValue = positionToCloseLiveValue !== null ? positionToCloseLiveValue * (closePercentage / 100) : null;

    const openModal = (positionId: string) => {
        const position = positions.find(p => p.position_id === positionId);
        if (!position) return;
        // Calculate the full amount considering decimals for display
        const fullAmountDecimal = parseFloat(position.amount) / (10 ** AMOUNT_DECIMALS);

        setClosingPositionId(positionId);
        setClosePercentage(100);
        // Set the initial modal amount to the full decimal value, formatted
        setModalCloseAmount(fullAmountDecimal.toFixed(AMOUNT_DECIMALS));
        setIsModalOpen(true);
        setModalAmountError(null); // Reset error on open
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
        setModalAmountError(null); // Clear error when slider is used

        if (totalPositionAmount > 0) {
            const calculatedAmount = (totalPositionAmount * percentage) / 100;
            // Format with the correct number of decimals
            const formattedAmount = calculatedAmount.toFixed(AMOUNT_DECIMALS);
            setModalCloseAmount(formattedAmount);
        } else {
            setModalCloseAmount("0"); // Or "0.000000" if preferred
        }
    };

    const handleConfirmClose = () => {
        // Convert the decimal amount back to the base unit integer for the transaction
        const closeAmountBaseUnits = Math.round(parseFloat(modalCloseAmount) * (10 ** AMOUNT_DECIMALS));

        // Ensure the calculated base units are not negative and not zero if modalCloseAmount was > 0
        if (isNaN(closeAmountBaseUnits) || closeAmountBaseUnits < 0 || (parseFloat(modalCloseAmount) > 0 && closeAmountBaseUnits === 0)) {
             console.error("Invalid amount calculated for closing:", modalCloseAmount, closeAmountBaseUnits);
             setModalAmountError("Invalid closing amount calculated.");
             return; // Prevent closing with invalid amount
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
                        const liveValue = calculatePositionValue(position, livePrice);
                        const formattedAmount = formatAmount(position.amount, 6);

                        return (
                            <div key={position.position_id} className="card bg-backgroundOffset p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className='w-6 h-6 bg-gray-600 rounded-full'></div>
                                    <span className="font-semibold text-primaryText text-lg">
                                        Token Index {position.supported_positions_token_i}
                                    </span>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${position.position_type === 'Long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {position.position_type}
                                    </span>
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
                                Amount to Close (Max: {totalPositionAmount.toFixed(AMOUNT_DECIMALS)})
                            </label>
                            <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                <input
                                    id="modal-close-amount"
                                    type="text" // Use text to allow intermediate states like "."
                                    inputMode="decimal" // Hint for mobile keyboards
                                    className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent"
                                    value={modalCloseAmount}
                                    onChange={handleModalAmountChange}
                                    placeholder={`0.${'0'.repeat(AMOUNT_DECIMALS)}`} // Dynamic placeholder based on decimals
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