"use client";
import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { VaultData as BackendVaultData } from "@/types";
import {
    useSignAndExecuteTransaction,
    useCurrentAccount,
    useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import NotificationPopup from '../common/NotificationPopup';
import { useRefresh } from '@/contexts/RefreshContext'; // Import useRefresh

// Read constants from environment variables
const SUI_PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const GLOBAL_OBJECT_ID = process.env.NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID;

// Ensure environment variables are set
if (!SUI_PACKAGE_ID || !GLOBAL_OBJECT_ID) {
  throw new Error("Required environment variables NEXT_PUBLIC_SUI_PACKAGE_ID or NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID are not set.");
}

interface TabButtonProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
}

interface ManageLPProps {
    vault: BackendVaultData;
}

// Helper to extract a display name/symbol from coin_type
const getDisplayName = (coinType: string): string => {
    const parts = coinType.split('::');
    return parts[parts.length - 1] || "Unknown";
};

const formatBalance = (balance: bigint | number | undefined, decimals: number | undefined): string => {
    const validDecimals = decimals !== undefined && decimals >= 0 ? decimals : 0;
    if (balance === undefined) return '0.00';
    const numBalance = typeof balance === 'bigint' ? Number(balance) : balance;
    const divisor = validDecimals > 0 ? Math.pow(10, validDecimals) : 1;
    return (numBalance / divisor).toFixed(validDecimals);
};

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => {
    return (
        <button
            className={`position-button ${isActive ? "position-button-active" : "position-button-inactive"} px-12 max-md:px-5`}
            onClick={onClick}
        >
            {label}
        </button>
    );
};

const ManageLP: React.FC<ManageLPProps> = ({ vault }) => {
    const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
    const [amount, setAmount] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [userCoinBalance, setUserCoinBalance] = useState<bigint | undefined>(undefined);
    const [userLpBalance, setUserLpBalance] = useState<bigint | undefined>(undefined);
    const [coinDecimals, setCoinDecimals] = useState<number | undefined>(undefined);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const currentAccount = useCurrentAccount();
    const suiClient = useSuiClient();
    const { refreshCount } = useRefresh(); // Get refreshCount from context

    const network = process.env.SUI_NETWORK || 'testnet';
    const chainIdentifier: `${string}:${string}` = `sui:${network}`;

    const lpTokenType = useMemo(() => {
        return `${SUI_PACKAGE_ID}::lp::LPToken<${vault.coin_type}>`;
    }, [vault.coin_type]);

    const symbol = useMemo(() => getDisplayName(vault.coin_type), [vault.coin_type]);

    // Extracted function to fetch balances and metadata
    const fetchBalancesAndMetadata = async () => {
        if (!currentAccount || !suiClient || !vault) {
            console.log("Fetch skipped: Missing account, client, or vault prop.", { currentAccount, suiClient, vault });
            setUserCoinBalance(undefined);
            setUserLpBalance(undefined);
            setCoinDecimals(undefined);
            return;
        }
        try {
            console.log("Fetching coin balance and metadata for:", vault.coin_type);
            const [coinBalanceResult, coinMetadataResult] = await Promise.all([
                suiClient.getBalance({
                    owner: currentAccount.address,
                    coinType: vault.coin_type,
                }),
                suiClient.getCoinMetadata({ coinType: vault.coin_type })
            ]);

            console.log("Coin balance raw result:", coinBalanceResult);
            setUserCoinBalance(BigInt(coinBalanceResult.totalBalance));
            console.log("Set userCoinBalance to:", BigInt(coinBalanceResult.totalBalance));

            console.log("Coin metadata raw result:", coinMetadataResult);
            setCoinDecimals(coinMetadataResult?.decimals);
            console.log("Set coinDecimals to:", coinMetadataResult?.decimals);

            console.log("Fetching LP balance for:", lpTokenType);
            const lpBalanceResult = await suiClient.getBalance({
                owner: currentAccount.address,
                coinType: lpTokenType,
            });

            console.log("LP balance raw result:", lpBalanceResult);
            setUserLpBalance(BigInt(lpBalanceResult.totalBalance));
            console.log("Set userLpBalance to:", BigInt(lpBalanceResult.totalBalance));

        } catch (error) {
            console.error("Error fetching balances or metadata:", error);
            setErrorMsg("Failed to fetch balances or metadata.");
            setUserCoinBalance(undefined);
            setUserLpBalance(undefined);
            setCoinDecimals(undefined);
        }
    };

    useEffect(() => {
        console.log("useEffect triggered. Vault Coin Type:", vault?.coin_type, "Refresh Count:", refreshCount);
        fetchBalancesAndMetadata();
    }, [currentAccount, suiClient, vault, lpTokenType, refreshCount]);

    const handleMaxClick = () => {
        setErrorMsg(null);
        console.log("handleMaxClick - User Coin Balance:", userCoinBalance, "Decimals:", coinDecimals);
        console.log("handleMaxClick - User LP Balance:", userLpBalance);
        if (activeTab === 'deposit') {
            if (coinDecimals !== undefined) {
                setAmount(formatBalance(userCoinBalance, coinDecimals));
            } else {
                setErrorMsg("Coin decimals not loaded yet.");
            }
        } else {
            setAmount(formatBalance(userLpBalance, 0));
        }
    };

    const executeTransaction = (txb: Transaction) => {
        setIsLoading(true);
        setErrorMsg(null);
        signAndExecuteTransaction(
            {
                transaction: txb,
                chain: chainIdentifier,
            },
            {
                onSuccess: (result) => {
                    console.log(`${activeTab} successful:`, result);
                    setErrorMsg(null);
                    setAmount('');
                    setSuccessMessage(`Successfully completed ${activeTab}.`);
                    setShowSuccessPopup(true);
                    // Refetch balances after successful transaction
                    fetchBalancesAndMetadata();
                },
                onError: (error) => {
                    console.error(`Error during ${activeTab}:`, error);
                    setErrorMsg(`Transaction failed: ${error.message}`);
                },
                onSettled: () => {
                    setIsLoading(false);
                },
            }
        );
    };

    const handleDeposit = async () => {
        if (!currentAccount || !amount || coinDecimals === undefined || !vault?.object_id) {
            setErrorMsg("Please connect wallet, enter amount, and ensure vault data is loaded.");
            console.error("Deposit check failed:", { currentAccount, amount, coinDecimals, vault });
            return;
        }
        const amountPostDecimal = Math.floor(parseFloat(amount) * Math.pow(10, coinDecimals));

        if (amountPostDecimal <= 0) {
            setErrorMsg("Amount must be positive.");
            return;
        }

        try {
            setIsLoading(true);
            setErrorMsg(null);

            const coins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: vault.coin_type,
            });

            if (coins.data.length === 0) {
                throw new Error(`No ${symbol} coins found in wallet.`);
            }

            const txb = new Transaction();
            const inputCoinObjects = coins.data.map(c => txb.object(c.coinObjectId));
            if (inputCoinObjects.length > 1) {
                txb.mergeCoins(inputCoinObjects[0], inputCoinObjects.slice(1));
            }
            const [actualCoinToDeposit] = txb.splitCoins(inputCoinObjects[0], [amountPostDecimal]);
            txb.moveCall({
                target: `${SUI_PACKAGE_ID}::lp::deposit_lp`,
                typeArguments: [vault.coin_type, vault.coin_type],
                arguments: [
                    txb.object(GLOBAL_OBJECT_ID),
                    txb.object(vault.object_id),
                    actualCoinToDeposit
                ],
            });

            executeTransaction(txb);
        } catch (error) {
            setErrorMsg(`Deposit failed: ${error instanceof Error ? error.message : String(error)}`);
            setIsLoading(false);
        }
    };

    const handleWithdraw = async () => {
        if (!currentAccount || !amount || !vault?.object_id) {
            setErrorMsg("Please connect wallet, enter amount, and ensure vault data is loaded.");
            console.error("Withdraw check failed:", { currentAccount, amount, vault });
            return;
        }
        const amountInSmallestUnit = BigInt(amount);

        if (amountInSmallestUnit <= 0) { // Should this be 0n?
            setErrorMsg("Amount must be positive.");
            return;
        }

        try {
            setIsLoading(true);
            setErrorMsg(null);

            const lpTokens = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: lpTokenType,
            });

            if (lpTokens.data.length === 0) {
                throw new Error(`No ${symbol} LP tokens found.`);
            }

            const txb = new Transaction();
            const inputLpObjects = lpTokens.data.map(c => txb.object(c.coinObjectId));
            if (inputLpObjects.length > 1) {
                txb.mergeCoins(inputLpObjects[0], inputLpObjects.slice(1));
            }
            const [lpTokenToWithdraw] = txb.splitCoins(inputLpObjects[0], [txb.pure.u64(amountInSmallestUnit.toString())]);
            txb.moveCall({
                target: `${SUI_PACKAGE_ID}::lp::withdraw_lp`,
                typeArguments: [vault.coin_type, vault.coin_type],
                arguments: [
                    txb.object(GLOBAL_OBJECT_ID),
                    txb.object(vault.object_id),
                    lpTokenToWithdraw
                ],
            });

            executeTransaction(txb);
        } catch (error) {
            setErrorMsg(`Withdrawal failed: ${error instanceof Error ? error.message : String(error)}`);
            setIsLoading(false);
        }
    };

    const handleAction = () => {
        if (activeTab === 'deposit') {
            handleDeposit();
        } else {
            handleWithdraw();
        }
    };

    return (
        <section className="card flex flex-col pb-6 border border-secondary h-full">
            <h2 className="header-title text-2xl">Manage LP</h2>

            <div className="flex gap-2 mt-6 font-semibold text-center whitespace-nowrap">
                <TabButton
                    label="Deposit"
                    isActive={activeTab === 'deposit'}
                    onClick={() => { setActiveTab('deposit'); setAmount(''); setErrorMsg(null); }}
                />
                <TabButton
                    label="Withdraw"
                    isActive={activeTab === 'withdraw'}
                    onClick={() => { setActiveTab('withdraw'); setAmount(''); setErrorMsg(null); }}
                />
            </div>

            <label className="text-label mt-6">Amount</label>
            <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                        setErrorMsg(null);
                    }}
                    placeholder={activeTab === 'deposit' ? "0.00" : "0"}
                    className="input-field bg-transparent p-0 my-auto w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="0"
                    step={activeTab === 'withdraw' ? "1" : "any"}
                />
                <button
                    className="text-center text-primary flex-shrink-0"
                    onClick={handleMaxClick}
                    disabled={isLoading || !currentAccount}
                >
                    MAX
                </button>
            </div>

            {!currentAccount && (
                <p className="text-red-500 text-xs mt-2">Please connect your wallet.</p>
            )}

            <div className="flex gap-5 justify-between mt-6 text-sm">
                <div className="text-label">
                    <div>Wallet Balance</div>
                    <div className="mt-2">Current LP</div>
                </div>
                <div className="flex flex-col text-value items-end">
                    <div>{formatBalance(userCoinBalance, coinDecimals)} {symbol}</div>
                    <div className="mt-2">{formatBalance(userLpBalance, 0)}</div>
                </div>
            </div>

            {errorMsg && (
                <p className="text-red-500 text-xs mt-2">{errorMsg}</p>
            )}

            <button
                className="btn-action mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAction}
                disabled={isLoading || !currentAccount || !amount || parseFloat(amount) <= 0 || (activeTab === 'deposit' && coinDecimals === undefined)}
            >
                {isLoading ? 'Processing...' : (activeTab === 'deposit' ? `Deposit ${symbol}` : `Withdraw ${symbol}`)}
            </button>

            <NotificationPopup
                message={successMessage}
                isVisible={showSuccessPopup}
                onClose={() => setShowSuccessPopup(false)}
            />
        </section>
    );
};
export default ManageLP;
