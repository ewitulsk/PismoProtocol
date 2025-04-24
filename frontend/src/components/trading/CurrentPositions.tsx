import React, { useState } from 'react';
// Assuming Icons.tsx exists and exports necessary icons like TokenIcon
// import { TokenIcon } from './Icons'; 

interface Position {
    id: string;
    token: string;
    type: 'Long' | 'Short';
    value: string; // e.g., "$1,234.56"
    leverage: number; // e.g., 10 (for 10x)
    amount: string; // e.g., "1.5 ETH"
}

// Mock Data
const mockPositions: Position[] = [
    { id: '1', token: 'ETH', type: 'Long', value: '$5,432.10', leverage: 10, amount: '2.8 ETH' },
    { id: '2', token: 'BTC', type: 'Short', value: '$10,876.50', leverage: 5, amount: '0.5 BTC' },
];

// --- Helper Functions (Basic Parsing) ---
const parseAmountString = (amountStr: string): number => {
    const match = amountStr.match(/^[+-]?([0-9]*[.])?[0-9]+/);
    return match ? parseFloat(match[0]) : 0;
};

const parseValueString = (valueStr: string): number => {
    const cleaned = valueStr.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
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

const CurrentPositions: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
    const [modalCloseAmount, setModalCloseAmount] = useState<string>("");
    const [closePercentage, setClosePercentage] = useState<number>(100);

    const positionToClose = closingPositionId ? mockPositions.find(p => p.id === closingPositionId) : null;
    const totalPositionAmount = positionToClose ? parseAmountString(positionToClose.amount) : 0;
    const totalPositionValue = positionToClose ? parseValueString(positionToClose.value) : 0;

    const openModal = (positionId: string) => {
        const position = mockPositions.find(p => p.id === positionId);
        if (!position) return;
        const fullAmount = parseAmountString(position.amount);
        
        setClosingPositionId(positionId);
        setClosePercentage(100);
        setModalCloseAmount(fullAmount.toString());
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setClosingPositionId(null);
        setModalCloseAmount("");
        setClosePercentage(100);
    };

    const handleModalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputAmountStr = e.target.value;
        setModalCloseAmount(inputAmountStr);

        const inputAmountNum = parseFloat(inputAmountStr);
        if (!isNaN(inputAmountNum) && totalPositionAmount > 0) {
            const percentage = Math.max(0, Math.min(100, (inputAmountNum / totalPositionAmount) * 100));
            setClosePercentage(percentage);
        } else if (inputAmountStr === "") {
            setClosePercentage(0);
        }
    };
    
    const handleSliderChange = (percentage: number) => {
        setClosePercentage(percentage);
        if (totalPositionAmount > 0) {
            const calculatedAmount = (totalPositionAmount * percentage) / 100;
            const formattedAmount = calculatedAmount.toFixed(Math.min(8, Math.max(2, (calculatedAmount.toString().split('.')[1] || '').length))); 
            setModalCloseAmount(formattedAmount);
        } else {
            setModalCloseAmount("0");
        }
    };

    const handleConfirmClose = () => {
        console.log(`Closing position ${closingPositionId} with amount ${modalCloseAmount} (${closePercentage.toFixed(0)}%)`);
        closeModal(); 
    };

    const valueToClose = (totalPositionValue * closePercentage) / 100;

    return (
        <section className="mt-8">
            <h2 className="text-xl font-semibold text-primaryText mb-4 pl-4">Your Positions</h2>
            <div className="space-y-4">
                {mockPositions.length === 0 ? (
                    <p className="text-secondaryText text-center py-4">You have no open positions.</p>
                ) : (
                    mockPositions.map((position) => (
                        <div key={position.id} className="card bg-backgroundOffset p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <div className='w-6 h-6 bg-gray-600 rounded-full'></div>
                                <span className="font-semibold text-primaryText text-lg">{position.token}</span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${position.type === 'Long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {position.type}
                                </span>
                            </div>

                            <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                                <div>
                                    <span className="text-secondaryText block">Value</span>
                                    <span className="text-primaryText font-medium">{position.value}</span>
                                </div>
                                <div>
                                    <span className="text-secondaryText block">Leverage</span>
                                    <span className="text-primaryText font-medium">{position.leverage}x</span>
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <span className="text-secondaryText block">Amount</span>
                                    <span className="text-primaryText font-medium">{position.amount}</span>
                                </div>
                            </div>

                            <button 
                                className="btn-action text-sm py-2 px-4 flex-shrink-0 w-full sm:w-auto"
                                onClick={() => openModal(position.id)}
                            > 
                                Close
                            </button>
                        </div>
                    ))
                )}
            </div>

            {isModalOpen && positionToClose && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
                    onClick={closeModal}
                >
                    <div 
                        className="card bg-backgroundOffset p-6 rounded-lg shadow-xl w-full max-w-md border border-secondary"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-primaryText mb-4">
                            Close {positionToClose.token} {positionToClose.type} Position
                        </h3>
                        
                        <div className="mb-4">
                            <label className="input-label block text-secondaryText mb-2" htmlFor="modal-close-amount">
                                Amount to Close (Max: {positionToClose.amount}) 
                            </label>
                            <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                                <input
                                    id="modal-close-amount"
                                    type="text"
                                    className="input-field bg-transparent p-0 my-auto w-full text-primaryText focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:placeholder-transparent"
                                    value={modalCloseAmount}
                                    onChange={handleModalAmountChange}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="input-label block text-secondaryText mb-2">
                                Percentage: <span className="text-primaryText font-medium">{closePercentage.toFixed(0)}%</span>
                            </label>
                            <Slider 
                                value={closePercentage} 
                                onChange={handleSliderChange} 
                            />
                        </div>

                        <div className="text-sm text-secondaryText">
                            Value to Close: <span className="text-primaryText font-medium">${valueToClose.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                                disabled={!modalCloseAmount || parseFloat(modalCloseAmount) <= 0}
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