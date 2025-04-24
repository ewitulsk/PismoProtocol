import React, { useState, useEffect } from "react";

// Assuming Icons.tsx exists and exports necessary icons like TokenIcon
// import { TokenIcon } from './Icons'; 

// Basic Slider component placeholder (replace with actual implementation or library)
const Slider: React.FC<{ value: number; onChange: (value: number) => void }> = ({ value, onChange }) => {
    // Basic range input as a placeholder
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
const Select: React.FC<{ options: string[]; selected: string; onChange: (value: string) => void; className?: string }> = ({ options, selected, onChange, className }) => {
    return (
        <select
            value={selected}
            onChange={(e) => onChange(e.target.value)}
            className={className || "w-full"}
        >
            {options.map(option => (
                <option key={option} value={option} className="bg-gray-800 text-primaryText">{option}</option>
            ))}
        </select>
    );
};

type TabType = "Positions" | "Collateral";
type PositionType = "Long" | "Short";
type CollateralActionType = "Deposit" | "Withdraw";

const ActionTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("Positions");
  const [positionType, setPositionType] = useState<PositionType>("Long");
  const [amount, setAmount] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(5); // Default leverage
  const [collateralAction, setCollateralAction] = useState<CollateralActionType>("Deposit");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [selectedToken, setSelectedToken] = useState<string>("ETH"); // Default token for deposit
  const [selectedWithdrawToken, setSelectedWithdrawToken] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");

  // Mock Data
  const mockTokens = ["ETH", "USDC", "WBTC"]; // For deposit dropdown
  const mockCollateralPositions = [
    { id: "1", token: "ETH", amount: "2.5" },
    { id: "2", token: "USDC", amount: "10000" },
  ];
  const availableWithdrawTokens = mockCollateralPositions.map(pos => pos.token);

  // Effect to set default selected withdraw token if available
  useEffect(() => {
    if (collateralAction === "Withdraw" && availableWithdrawTokens.length > 0 && !selectedWithdrawToken) {
      setSelectedWithdrawToken(availableWithdrawTokens[0]);
    }
    // Reset amount when switching tabs or actions
    setWithdrawAmount("");
  }, [collateralAction, availableWithdrawTokens, selectedWithdrawToken]);

  const handlePositionClick = (newPosition: PositionType) => {
    setPositionType(newPosition);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  const handleLeverageChange = (value: number) => {
    setLeverage(value);
  };

  const handleDepositAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDepositAmount(e.target.value);
  };

  const handleTokenChange = (value: string) => {
    setSelectedToken(value);
  };

  const handleWithdrawTokenChange = (value: string) => {
    setSelectedWithdrawToken(value);
    setWithdrawAmount(""); // Reset amount when token changes
  };

  const handleWithdrawAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWithdrawAmount(e.target.value);
  };

  // Function to calculate leverage color (Green to Red)
  const getLeverageColor = (value: number, maxLeverage: number = 100): string => {
    const minLeverage = 1;
    // Normalize leverage to a 0-1 range
    const normalized = (value - minLeverage) / (maxLeverage - minLeverage);
    // Interpolate hue from green (120) to red (0)
    const hue = (1 - normalized) * 120;
    return `hsl(${hue}, 100%, 50%)`;
  };

  return (
    <section className="card bg-backgroundOffset mt-4 border border-secondary">
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
                Amount
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
                </div>
            </div>

            <button className="btn-action w-full mt-6">
              Place Order
            </button>
          </div>
        )}

        {/* Collateral Tab Content */}
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

            {/* Deposit Section */}
            {collateralAction === "Deposit" && (
                <div className="space-y-4">
                     <div>
                         <label className="input-label block text-secondaryText mb-2" htmlFor="token-select">
                             Token
                         </label>
                         <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                            <Select
                                options={mockTokens}
                                selected={selectedToken}
                                onChange={handleTokenChange}
                                className="input-field bg-transparent border-none focus:outline-none w-full text-primaryText appearance-none"
                            />
                         </div>
                    </div>
                     <div>
                         <label className="input-label block text-secondaryText mb-2" htmlFor="deposit-amount-input">
                             Amount
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
                    <button className="btn-action w-full mt-6">
                        Deposit {selectedToken}
                    </button>
                </div>
            )}

            {/* Withdraw Section */}
            {collateralAction === "Withdraw" && (
                <div className="space-y-4">
                    <h3 className="input-label text-lg font-semibold text-secondaryText mb-3">Your Collateral</h3> 
                    {mockCollateralPositions.length === 0 ? (
                        <p className="text-secondaryText">No collateral deposited.</p>
                    ) : (
                        <div className="space-y-2 border-y border-gray-700 py-3 mb-4">
                            {mockCollateralPositions.map(pos => (
                                <div key={pos.id} className="flex items-center justify-between gap-4 px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-primaryText">{pos.token}</span>
                                    </div>
                                    <span className="text-sm text-secondaryText">{pos.amount}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {availableWithdrawTokens.length > 0 && (
                        <>
                            <div>
                                <label className="input-label block text-secondaryText mb-2" htmlFor="withdraw-token-select">
                                    Token
                                </label>
                                <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                    <Select
                                        options={availableWithdrawTokens}
                                        selected={selectedWithdrawToken}
                                        onChange={handleWithdrawTokenChange}
                                        className="input-field bg-transparent border-none focus:outline-none w-full text-primaryText appearance-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="input-label block text-secondaryText mb-2" htmlFor="withdraw-amount-input">
                                    Amount
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
                                </div>
                            </div>

                            <button
                                className="btn-action w-full mt-6"
                                disabled={!selectedWithdrawToken || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                            >
                                Withdraw {selectedWithdrawToken}
                            </button>
                        </>
                    )}
                </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default ActionTabs;