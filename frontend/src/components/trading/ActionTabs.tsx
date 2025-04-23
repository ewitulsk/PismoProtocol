import React, { useState } from "react";

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
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
    );
};

// Basic Select component placeholder (replace with actual implementation or library)
const Select: React.FC<{ options: string[]; selected: string; onChange: (value: string) => void }> = ({ options, selected, onChange }) => {
    return (
        <select 
            value={selected} 
            onChange={(e) => onChange(e.target.value)}
            className="input-field bg-gray-800 border border-gray-700 rounded px-3 py-2 w-full" // Added basic styling
        >
            {options.map(option => (
                <option key={option} value={option}>{option}</option>
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
  const [amount, setAmount] = useState<string>("0.00");
  const [leverage, setLeverage] = useState<number>(5); // Default leverage
  const [collateralAction, setCollateralAction] = useState<CollateralActionType>("Deposit");
  const [depositAmount, setDepositAmount] = useState<string>("0.00");
  const [selectedToken, setSelectedToken] = useState<string>("ETH"); // Default token
  const [withdrawAmounts, setWithdrawAmounts] = useState<{ [key: string]: string }>({});

  // Mock Data
  const mockTokens = ["ETH", "USDC", "WBTC"];
  const mockCollateralPositions = [
    { id: "1", token: "ETH", amount: "2.5" },
    { id: "2", token: "USDC", amount: "10000" },
  ];

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

  const handleWithdrawAmountChange = (tokenId: string, value: string) => {
    setWithdrawAmounts(prev => ({ ...prev, [tokenId]: value }));
  };


  return (
    <section className="card bg-backgroundOffset mt-4"> {/* Added mt-4 for spacing */}
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          className={`tab flex-1 py-3 px-4 text-center font-medium ${activeTab === "Positions" ? "tab-active border-b-2 border-accentPink text-primaryText" : "text-secondaryText hover:text-primaryText"}`}
          onClick={() => setActiveTab("Positions")}
        >
          Positions
        </button>
        <button
          className={`tab flex-1 py-3 px-4 text-center font-medium ${activeTab === "Collateral" ? "tab-active border-b-2 border-accentPink text-primaryText" : "text-secondaryText hover:text-primaryText"}`}
          onClick={() => setActiveTab("Collateral")}
        >
          Collateral
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4"> {/* Added padding */}
        {/* Positions Tab Content */}
        {activeTab === "Positions" && (
          <div>
            <div className="flex gap-4 mb-6 max-sm:gap-2">
              <button
                className={`position-button flex-1 ${positionType === "Long" ? "position-button-active bg-emerald-500 hover:bg-emerald-600" : "position-button-inactive bg-gray-700 hover:bg-gray-600"} text-white font-bold py-2 px-4 rounded`}
                onClick={() => handlePositionClick("Long")}
              >
                Long
              </button>
              <button
                className={`position-button flex-1 ${positionType === "Short" ? "position-button-active bg-red-500 hover:bg-red-600" : "position-button-inactive bg-gray-700 hover:bg-gray-600"} text-white font-bold py-2 px-4 rounded`}
                onClick={() => handlePositionClick("Short")}
              >
                Short
              </button>
            </div>

            <div className="mb-6">
              <label className="input-label block text-secondaryText mb-2" htmlFor="leverage-slider">
                Leverage: <span className="text-primaryText font-semibold">{leverage}x</span>
              </label>
              <Slider value={leverage} onChange={handleLeverageChange} />
            </div>

            <div className="mb-6">
              <label className="input-label block text-secondaryText mb-2" htmlFor="amount-input">
                Amount
              </label>
              <input
                id="amount-input"
                type="text"
                className="input-field w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-primaryText focus:outline-none focus:border-accentPink"
                value={amount}
                onChange={handleAmountChange}
              />
            </div>

            <button className="btn-action w-full bg-accentPink hover:bg-pink-700 text-white font-bold py-3 px-4 rounded">
              Place Order
            </button>
          </div>
        )}

        {/* Collateral Tab Content */}
        {activeTab === "Collateral" && (
          <div>
             <div className="flex gap-4 mb-6 max-sm:gap-2 border-b border-gray-700 pb-4">
                <button
                    className={`flex-1 py-2 px-4 rounded font-medium ${collateralAction === "Deposit" ? "bg-gray-700 text-primaryText" : "text-secondaryText hover:bg-gray-800"}`}
                    onClick={() => setCollateralAction("Deposit")}
                >
                    Deposit
                </button>
                <button
                    className={`flex-1 py-2 px-4 rounded font-medium ${collateralAction === "Withdraw" ? "bg-gray-700 text-primaryText" : "text-secondaryText hover:bg-gray-800"}`}
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
                        <Select 
                            options={mockTokens} 
                            selected={selectedToken} 
                            onChange={handleTokenChange}
                        />
                    </div>
                     <div>
                         <label className="input-label block text-secondaryText mb-2" htmlFor="deposit-amount-input">
                             Amount
                         </label>
                        <input
                            id="deposit-amount-input"
                            type="text"
                             className="input-field w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-primaryText focus:outline-none focus:border-accentPink"
                            value={depositAmount}
                            onChange={handleDepositAmountChange}
                        />
                    </div>
                    <button className="btn-action w-full bg-accentPink hover:bg-pink-700 text-white font-bold py-3 px-4 rounded">
                        Deposit {selectedToken}
                    </button>
                </div>
            )}

            {/* Withdraw Section */}
            {collateralAction === "Withdraw" && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-primaryText mb-3">Your Collateral</h3>
                    {mockCollateralPositions.length === 0 ? (
                        <p className="text-secondaryText">No collateral deposited.</p>
                    ) : (
                        mockCollateralPositions.map(pos => (
                            <div key={pos.id} className="flex items-center justify-between gap-4 p-3 bg-gray-800 rounded">
                                <div className="flex items-center gap-2">
                                    {/* Placeholder for Token Icon */}
                                    {/* <TokenIcon token={pos.token} /> */}
                                    <span className="font-medium text-primaryText">{pos.token}</span>
                                    <span className="text-sm text-secondaryText">({pos.amount})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Amount"
                                        className="input-field w-24 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-primaryText text-sm focus:outline-none focus:border-accentPink"
                                         value={withdrawAmounts[pos.id] || ''}
                                        onChange={(e) => handleWithdrawAmountChange(pos.id, e.target.value)}
                                    />
                                     <button className="btn-action text-sm bg-accentPink hover:bg-pink-700 text-white font-bold py-1 px-3 rounded">
                                        Withdraw
                                    </button>
                                </div>
                            </div>
                        ))
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