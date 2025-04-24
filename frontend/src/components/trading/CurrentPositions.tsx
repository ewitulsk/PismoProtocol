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


const CurrentPositions: React.FC = () => {
    const [closeAmounts, setCloseAmounts] = useState<{ [key: string]: string }>({});

    const handleCloseAmountChange = (positionId: string, value: string) => {
        setCloseAmounts(prev => ({ ...prev, [positionId]: value }));
    };

    return (
        <section className="mt-8"> {/* Add margin top for spacing */}
            <h2 className="text-xl font-semibold text-primaryText mb-4">Your Positions</h2>
            <div className="space-y-4">
                {mockPositions.length === 0 ? (
                     <p className="text-secondaryText text-center py-4">You have no open positions.</p>
                ) : (
                    mockPositions.map((position) => (
                        <div key={position.id} className="card bg-backgroundOffset p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {/* Placeholder for Token Icon */}
                                {/* <TokenIcon token={position.token} size={24} /> */}
                                <div className='w-6 h-6 bg-gray-600 rounded-full'></div> {/* Icon Placeholder */}
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

                             <div className="flex items-center gap-2 flex-shrink-0">
                                 <input
                                    type="text"
                                    placeholder="Amount to close"
                                    className="input-field w-32 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-primaryText text-sm focus:outline-none focus:border-accentPink"
                                    value={closeAmounts[position.id] || ''}
                                    onChange={(e) => handleCloseAmountChange(position.id, e.target.value)}
                                />
                                <button className="btn-action text-sm bg-accentPink hover:bg-pink-700 text-white font-bold py-1 px-3 rounded">
                                    Close Position
                                </button>
                             </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
};

export default CurrentPositions; 