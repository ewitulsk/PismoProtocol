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
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;

// Ensure environment variables are set
if (!SUI_PACKAGE_ID || !GLOBAL_OBJECT_ID) {
  throw new Error("Required environment variables NEXT_PUBLIC_SUI_PACKAGE_ID or NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID are not set.");
}
if (!INDEXER_URL) {
  throw new Error("Required environment variable NEXT_PUBLIC_INDEXER_URL is not set.");
}

interface TabButtonProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
}

interface ManageLPProps {
    vault: BackendVaultData;
}

interface VaultStaticDetails {
  vaultMarkerAddress: string;
  lpTokenAddress: string; // This is the full LP token type string
}

// Define NotificationState type for success popups, similar to MintTestCoinForm
type SuccessNotificationState = {
  show: boolean;
  message: string;
  type: 'success';
  digest?: string;
} | null;

// Helper to extract a display name/symbol from coin_type
const getDisplayName = (coinType: string): string => {
    const parts = coinType.split('::');
    return parts[parts.length - 1].replace(">", "") || "Unknown";
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
    const [successNotification, setSuccessNotification] = useState<SuccessNotificationState>(null);

    const [vaultStaticDetails, setVaultStaticDetails] = useState<VaultStaticDetails | null>(null);
    const [isLoadingVaultStaticDetails, setIsLoadingVaultStaticDetails] = useState(false);

    const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const currentAccount = useCurrentAccount();
    const suiClient = useSuiClient();
    const { refreshCount } = useRefresh(); // Get refreshCount from context

    const network = process.env.SUI_NETWORK || 'testnet';
    const chainIdentifier: `${string}:${string}` = `sui:${network}`;

    const prefixedVaultCoinType = useMemo(() => {
        if (!vault?.coin_type) return "";
        return vault.coin_type.startsWith('0x') ? vault.coin_type : `0x${vault.coin_type}`;
    }, [vault?.coin_type]);

    const lpTokenType = useMemo(() => {
        if (vaultStaticDetails?.lpTokenAddress && SUI_PACKAGE_ID) {
            const prefixedLpTokenAddress = vaultStaticDetails.lpTokenAddress.startsWith('0x') 
                ? vaultStaticDetails.lpTokenAddress 
                : `0x${vaultStaticDetails.lpTokenAddress}`;
            return `${SUI_PACKAGE_ID}::lp::LPToken<${prefixedLpTokenAddress}>`;
        }
        return "";
    }, [vaultStaticDetails]);

    const baseCoinSymbol = useMemo(() => getDisplayName(vault.coin_type), [vault.coin_type]);

    useEffect(() => {
        if (vault?.object_id) {
            const fetchVaultStaticDetails = async () => {
                setIsLoadingVaultStaticDetails(true);
                setErrorMsg(null); // Clear previous errors
                setVaultStaticDetails(null); // Clear old details
                try {
                    console.log("Fetching vault static details for:", vault.object_id);
                    const indexerResponse = await fetch(`${INDEXER_URL}/v0/vaults/${vault.object_id}`);
                    if (!indexerResponse.ok) {
                        const errorData = await indexerResponse.json().catch(() => ({ message: "Failed to parse error from indexer" }));
                        throw new Error(`Failed to fetch vault details from indexer: ${errorData.message || indexerResponse.statusText}`);
                    }
                    const details = await indexerResponse.json();
                    if (!details.vault_marker_address || !details.lp_token_info) {
                        console.error("Incomplete static details from indexer:", details);
                        throw new Error("Incomplete vault details received from indexer (missing marker or lp token info).");
                    }
                    setVaultStaticDetails({
                        vaultMarkerAddress: details.vault_marker_address,
                        lpTokenAddress: details.lp_token_info,
                    });
                    console.log("Vault static details fetched:", details);
                } catch (error) {
                    console.error("Error fetching vault static details:", error);
                    setErrorMsg(`Failed to load vault configuration: ${error instanceof Error ? error.message : String(error)}`);
                    setVaultStaticDetails(null);
                } finally {
                    setIsLoadingVaultStaticDetails(false);
                }
            };
            fetchVaultStaticDetails();
        } else {
            setVaultStaticDetails(null); // Clear details if vault is not selected or object_id is missing
            console.log("Vault object_id missing, clearing static details.");
        }
    }, [vault?.object_id]);

    const fetchBalancesAndMetadata = async () => {
        if (!currentAccount || !suiClient || !vault) {
            console.log("Fetch skipped: Missing account, client, or vault prop.", { currentAccount, suiClient, vault });
            setUserCoinBalance(undefined);
            setUserLpBalance(undefined);
            setCoinDecimals(undefined);
            return;
        }

        // Fetch base coin balance and metadata
        try {
            console.log("Fetching base coin balance and metadata for:", prefixedVaultCoinType);
            const [coinBalanceResult, coinMetadataResult] = await Promise.all([
                suiClient.getBalance({
                    owner: currentAccount.address,
                    coinType: prefixedVaultCoinType,
                }),
                suiClient.getCoinMetadata({ coinType: prefixedVaultCoinType })
            ]);

            console.log("Base coin balance raw result:", coinBalanceResult);
            setUserCoinBalance(BigInt(coinBalanceResult.totalBalance));
            console.log("Set userCoinBalance to:", BigInt(coinBalanceResult.totalBalance));

            console.log("Base coin metadata raw result:", coinMetadataResult);
            setCoinDecimals(coinMetadataResult?.decimals);
            console.log("Set coinDecimals to:", coinMetadataResult?.decimals);
        } catch (error) {
            console.error("Error fetching base coin balances or metadata:", error);
            setErrorMsg(`Failed to fetch balance/metadata for ${getDisplayName(vault.coin_type)}.`);
            setUserCoinBalance(undefined);
            setCoinDecimals(undefined);
            // Do not return here, allow attempt to fetch LP balance if possible, or clear it
        }

        // Fetch LP token balance only if lpTokenType is valid and available
        if (lpTokenType && lpTokenType.includes('::')) { // Basic check for a valid type string
            try {
                console.log("Fetching LP balance for:", lpTokenType);
                const lpBalanceResult = await suiClient.getBalance({
                    owner: currentAccount.address,
                    coinType: lpTokenType,
                });

                console.log("LP balance raw result:", lpBalanceResult);
                setUserLpBalance(BigInt(lpBalanceResult.totalBalance));
                console.log("Set userLpBalance to:", BigInt(lpBalanceResult.totalBalance));
            } catch (error) {
                console.error(`Error fetching LP balance for type ${lpTokenType}:`, error);
                setErrorMsg(`Failed to fetch LP balance for ${getDisplayName(lpTokenType)}.`);
                setUserLpBalance(undefined);
            }
        } else {
            console.log("Skipping LP balance fetch: lpTokenType is not valid or not yet available. Current lpTokenType:", lpTokenType);
            setUserLpBalance(undefined); // Explicitly set to undefined if not fetched or type is invalid
        }
    };

    useEffect(() => {
        console.log("useEffect triggered for balances. Vault Coin Type:", vault?.coin_type, "LP Token Type:", lpTokenType, "Refresh Count:", refreshCount);
        if (lpTokenType || vault?.coin_type) { // Ensure lpTokenType is available (derived from vaultStaticDetails) or coin_type for base coin
            fetchBalancesAndMetadata();
        } else {
            console.log("Skipping balance fetch: lpTokenType or vault.coin_type not yet available.");
            // Optionally clear balances if types are not ready
            setUserCoinBalance(undefined);
            setUserLpBalance(undefined);
            // coinDecimals are fetched based on vault.coin_type, so might still be relevant
        }
    }, [currentAccount, suiClient, vault?.coin_type, lpTokenType, refreshCount]); // vault.coin_type for base coin, lpTokenType for LP coin

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
                    setSuccessNotification({
                        show: true,
                        message: `Successfully completed ${activeTab}.`,
                        type: 'success',
                        digest: result.digest,
                    });
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
            console.error("Deposit check failed (initial validation):", { currentAccount, amount, coinDecimals, vault });
            return;
        }
        if (!vaultStaticDetails) {
            setErrorMsg("Vault configuration is not loaded yet. Please wait.");
            console.error("Deposit check failed: vaultStaticDetails not loaded", { vaultStaticDetails });
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

            const { vaultMarkerAddress, lpTokenAddress: retrievedLpTokenAddress } = vaultStaticDetails;

            const coins = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: prefixedVaultCoinType,
            });

            if (coins.data.length === 0) {
                throw new Error(`No ${baseCoinSymbol} coins found in wallet.`);
            }

            const txb = new Transaction();
            const inputCoinObjects = coins.data.map(c => txb.object(c.coinObjectId));
            if (inputCoinObjects.length > 1) {
                txb.mergeCoins(inputCoinObjects[0], inputCoinObjects.slice(1));
            }

            const [actualCoinToDeposit] = txb.splitCoins(inputCoinObjects[0], [amountPostDecimal]);
            console.log("Coin: ", actualCoinToDeposit);
            txb.moveCall({
                target: `${SUI_PACKAGE_ID}::lp::deposit_lp`,
                typeArguments: [prefixedVaultCoinType, retrievedLpTokenAddress],
                arguments: [
                    txb.object(vault.object_id), // vault object
                    txb.object(vaultMarkerAddress), 
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
            console.error("Withdraw check failed (initial validation):", { currentAccount, amount, vault });
            return;
        }
        if (!vaultStaticDetails) {
            setErrorMsg("Vault configuration is not loaded yet. Please wait.");
            console.error("Withdraw check failed: vaultStaticDetails not loaded", { vaultStaticDetails });
            return;
        }

        const amountInSmallestUnit = BigInt(amount);

        if (amountInSmallestUnit <= BigInt(0)) { // Ensure comparison with BigInt zero
            setErrorMsg("Amount must be positive.");
            return;
        }

        try {
            setIsLoading(true);
            setErrorMsg(null);

            const { vaultMarkerAddress, lpTokenAddress: retrievedLpTokenAddress } = vaultStaticDetails;

            // Ensure lpTokenType (derived from vaultStaticDetails.lpTokenAddress) is valid before fetching
            if (!lpTokenType) {
                throw new Error("LP Token type not available. Vault configuration may be loading or failed.");
            }

            const lpTokens = await suiClient.getCoins({
                owner: currentAccount.address,
                coinType: lpTokenType, // lpTokenType is now from vaultStaticDetails.lpTokenAddress
            });

            if (lpTokens.data.length === 0) {
                throw new Error(`No ${getDisplayName(lpTokenType)} LP tokens found.`);
            }

            const txb = new Transaction();
            const inputLpObjects = lpTokens.data.map(c => txb.object(c.coinObjectId));
            if (inputLpObjects.length > 1) {
                txb.mergeCoins(inputLpObjects[0], inputLpObjects.slice(1));
            }
            const [lpTokenToWithdraw] = txb.splitCoins(inputLpObjects[0], [txb.pure.u64(amountInSmallestUnit.toString())]);
            txb.moveCall({
                target: `${SUI_PACKAGE_ID}::lp::withdraw_lp`,
                typeArguments: [prefixedVaultCoinType, retrievedLpTokenAddress],
                arguments: [
                    txb.object(vault.object_id), // vault object
                    txb.object(vaultMarkerAddress), 
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
                    <div>{formatBalance(userCoinBalance, coinDecimals)} {baseCoinSymbol}</div>
                    <div className="mt-2">{formatBalance(userLpBalance, 0)} { userLpBalance !== undefined && lpTokenType ? getDisplayName(lpTokenType) : ""}</div>
                </div>
            </div>

            {errorMsg && (
                <p className="text-red-500 text-xs mt-2">{errorMsg}</p>
            )}
            {isLoadingVaultStaticDetails && (
                 <p className="text-yellow-500 text-xs mt-2">Loading vault configuration...</p>
            )}

            <button
                className="btn-action mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAction}
                disabled={isLoading || isLoadingVaultStaticDetails || !currentAccount || !amount || parseFloat(amount) <= 0 || (activeTab === 'deposit' && coinDecimals === undefined) || !vaultStaticDetails}
            >
                {isLoading ? 'Processing...' : isLoadingVaultStaticDetails ? 'Loading Config...' : (activeTab === 'deposit' ? `Deposit ${baseCoinSymbol}` : `Withdraw ${baseCoinSymbol}`)}
            </button>

            {successNotification?.show && (
                <NotificationPopup
                    message={successNotification.message}
                    type={successNotification.type}
                    digest={successNotification.digest}
                    onClose={() => setSuccessNotification(null)}
                />
            )}
        </section>
    );
};
export default ManageLP;
