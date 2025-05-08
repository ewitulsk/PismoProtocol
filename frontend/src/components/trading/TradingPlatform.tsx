"use client";
// import React from "react"; // React is implicitly imported in Next.js 13+
import React, { useState, useEffect } from "react"; // Explicitly import useState and useEffect
import Layout from "../common/Layout";
import ChartContainer from "./ChartContainer";
import AccountHealth from "./AccountHealth";
import ActionTabs from "./ActionTabs";
import CurrentPositions from "./CurrentPositions";
import "./trading-styles.css";

// Imports for account object fetching (moved from ActionTabs)
import {
    useCurrentAccount,
    useSuiClientQuery,
} from "@mysten/dapp-kit";
import { PaginatedObjectsResponse } from '@mysten/sui/client';

// Constants moved from ActionTabs (only those needed for accountObjectId fetching)
const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const ACCOUNT_TYPE = PACKAGE_ID ? `${PACKAGE_ID}::accounts::Account` : undefined;


const TradingPlatform: React.FC = () => {
  // State for accountObjectId (moved from ActionTabs)
  const [accountObjectId, setAccountObjectId] = useState<string | null>(null);
  // isLoadingAccountObject will now directly reflect the query's loading state or if the account is missing.
  const [isLoadingAccountObject, setIsLoadingAccountObject] = useState<boolean>(true);


  // Hooks for account object fetching (moved from ActionTabs)
  const account = useCurrentAccount();

  // Query for the Account object owned by the current user
  const { data: ownedAccountObject, isLoading: isLoadingOwnedAccountObjectQuery } = useSuiClientQuery(
    'getOwnedObjects',
    {
        owner: account?.address || '',
        filter: ACCOUNT_TYPE ? { StructType: ACCOUNT_TYPE } : { MatchNone: [] }, // Ensure ACCOUNT_TYPE is defined
        options: { showType: true, showContent: false, showOwner: false, showPreviousTransaction: false, showStorageRebate: false, showDisplay: false },
    },
    {
      enabled: !!account && !!ACCOUNT_TYPE, // Also check if ACCOUNT_TYPE is defined
      refetchInterval: 5000,
      select: (data: PaginatedObjectsResponse) => {
        if (data?.data && data.data.length > 0) {
            const accountObj = data.data.find(obj => obj.data?.objectId);
            return accountObj?.data?.objectId ?? null;
        }
        return null;
      },
    }
  );

  // Update accountObjectId state when query data changes (moved from ActionTabs)
  // Also manages the isLoadingAccountObject state
  useEffect(() => {
    if (!account) {
      setAccountObjectId(null);
      setIsLoadingAccountObject(true); // Still true if no account
      return;
    }
    // When an account is present, the loading state is determined by the query
    setIsLoadingAccountObject(isLoadingOwnedAccountObjectQuery);

    if (!isLoadingOwnedAccountObjectQuery) {
      const newAccountId = ownedAccountObject ?? null;
      if (newAccountId !== accountObjectId) {
        console.log("[TradingPlatform] Setting accountObjectId:", newAccountId);
        setAccountObjectId(newAccountId);
      }
    } else {
      // If the query is loading and we have an account, ensure accountObjectId is not prematurely nulled
      // if it already had a value from a previous successful fetch.
      // However, if ownedAccountObject becomes undefined (e.g. account changed, query reruns),
      // newAccountId will be null and correctly setAccountObjectId.
    }
  }, [account, ownedAccountObject, isLoadingOwnedAccountObjectQuery, accountObjectId]);


  return (
    <Layout activePage="trading">
      <div className="flex flex-col h-full overflow-y-auto">
        <section className="trading-layout flex-grow p-4 md:p-6 lg:p-8">
          <div className="trading-container grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="trading-chart-wrapper lg:col-span-2">
              <ChartContainer />
            </div>
            <aside className="trading-sidebar lg:col-span-1 flex flex-col gap-4">
              <AccountHealth percentage={85} />
              {/* Pass account, accountObjectId, and isLoadingAccountObject to ActionTabs */}
              <ActionTabs
                account={account}
                accountObjectId={accountObjectId}
                isLoadingAccount={isLoadingAccountObject}
              />
            </aside>
          </div>
          {/* Pass accountObjectId to CurrentPositions */}
          <CurrentPositions accountId={accountObjectId} />
        </section>
      </div>
    </Layout>
  );
};

export default TradingPlatform;