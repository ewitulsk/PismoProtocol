"use client"

import React, { useState } from "react"
import { useCurrentAccount } from '@mysten/dapp-kit'
import { useMyOracles } from "@/hooks/useOracleBuilderData"
import { useOracleBuilderRealtimeUpdates } from "@/hooks/useOracleWebSocket"
import { useOracleBuilder } from "@/hooks/useOracleBuilder"
import { useRealtimeDataIntegration } from "@/hooks/useRealtimeDataIntegration"
import { PriceFeedFormData } from "@/types/oracleBuilder"
import { UIOracle, UIPriceFeed } from "@/types/oracleBuilder"
import { WebSocketConnectionState } from "@/types/oracleWebSocket"
import OracleNav from "./OracleNav"
import OverviewStep from "./steps/OverviewStep"
import CreateStep from "./steps/CreateStep"
import ConfigureStep from "./steps/ConfigureStep"
import WebSocketDebugger from "./WebSocketDebugger"
import { Loader2, Wifi, WifiOff } from "lucide-react"

type Step = "overview" | "create" | "configure"
type ConfigureSource = "overview" | "create"

interface BuildOracleProps {
  onNavigate?: (tab: string) => void
}

interface OracleFormData {
  name: string
  description: string
  priceFeeds: Array<{
    id: string
    name: string
    description: string
    api_key: string
    underlying_url: string
    response_field: string
    live_url: string
  }>
}

// WebSocket connection status indicator with real-time integration info
const ConnectionStatus = ({ 
  connectionState,
  isRealtimeConnected,
  lastUpdateTime,
  updateCount
}: { 
  connectionState: WebSocketConnectionState;
  isRealtimeConnected?: boolean;
  lastUpdateTime?: Date | null;
  updateCount?: number;
}) => (
  <div className="flex items-center gap-2 text-sm mb-4 p-3 bg-gray-900 rounded-lg border border-gray-800">
    {connectionState.isConnecting ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
        <span className="text-yellow-400">
          {connectionState.error?.includes('Reconnecting') 
            ? connectionState.error
            : 'Connecting to real-time updates...'}
        </span>
      </>
    ) : connectionState.isConnected ? (
      <>
        <Wifi className="w-4 h-4 text-green-400" />
        <span className="text-green-400">Real-time updates active</span>
        {isRealtimeConnected && updateCount !== undefined && updateCount > 0 && (
          <span className="text-xs text-gray-400 ml-2">
            ({updateCount} updates{lastUpdateTime && `, last: ${lastUpdateTime.toLocaleTimeString()}`})
          </span>
        )}
      </>
    ) : (
      <>
        <WifiOff className="w-4 h-4 text-red-400" />
        <span className="text-red-400">
          {connectionState.error 
            ? connectionState.error 
            : 'Real-time updates offline'}
        </span>
      </>
    )}
  </div>
);

export default function BuildOracle({ onNavigate }: BuildOracleProps) {
  const currentAccount = useCurrentAccount();
  const oracleBuilder = useOracleBuilder();
  
  // Enhanced real-time integration with toast notifications for user's oracles
  const realtimeIntegration = useRealtimeDataIntegration({
    enableOptimisticUpdates: true,
    enableToastNotifications: true, // Enable toast notifications for the Build component
    autoSubscribe: !!currentAccount?.address
  });
  
  // Fetch oracle data - only user's own oracles (empty if no wallet)
  const { 
    data: oracles, 
    isLoading, 
    error,
    isConnected: isRealtimeConnected,
    lastUpdateTime,
    updateCount
  } = useMyOracles();
  
  // Set up WebSocket connection with message parsing and logging
  const { connection, recentMessages } = useOracleBuilderRealtimeUpdates(
    currentAccount?.address
  );
  
  // State for create/configure steps (unaffected by overview selectors)
  const [oracleFormData, setOracleFormData] = useState<OracleFormData>({
    name: "",
    description: "",
    priceFeeds: [],
  })

  const [configuredPriceFeeds, setConfiguredPriceFeeds] = useState<Array<{
    id: string
    name: string
    description: string
    api_key: string
    underlying_url: string
    response_field: string
    live_url: string
  }>>([])
  const [currentStep, setCurrentStep] = useState<Step>("overview")
  const [configureSource, setConfigureSource] = useState<ConfigureSource>("overview")
  
  // Oracle selection
  const [selectedOracleId, setSelectedOracleId] = useState("")
  
  // Set default selected oracle when data loads
  React.useEffect(() => {
    if (oracles && oracles.length > 0 && !selectedOracleId) {
      setSelectedOracleId(oracles[0].id);
    }
  }, [oracles, selectedOracleId]);
  
  const selectedOracle = oracles?.find((oracle: UIOracle) => oracle.id === selectedOracleId);

  // Price feed selection
  const [selectedPriceFeedId, setSelectedPriceFeedId] = useState("")
  
  React.useEffect(() => {
    if (selectedOracle?.priceFeeds && selectedOracle.priceFeeds.length > 0) {
      // Only set default if no price feed is selected or if the current selection doesn't belong to this oracle
      const currentSelectionExists = selectedOracle.priceFeeds.some(feed => feed.id === selectedPriceFeedId);
      if (!selectedPriceFeedId || !currentSelectionExists) {
        setSelectedPriceFeedId(selectedOracle.priceFeeds[0].id);
      }
    } else {
      setSelectedPriceFeedId("");
      }
    }, [selectedOracle]);
  
  const selectedFeed = selectedOracle?.priceFeeds.find((feed: UIPriceFeed) => feed.id === selectedPriceFeedId);

  const handleFormChange = (field: keyof OracleFormData, value: string) => {
    setOracleFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleNavigateToConfigure = (source: ConfigureSource) => {
    setConfigureSource(source)
    setCurrentStep("configure")
  }

  const handleBackFromConfigure = () => {
    setCurrentStep(configureSource)
  }

  const handleCreateNew = () => {
    setCurrentStep("create")
  }

  const handleBackToOverview = () => {
    setCurrentStep("overview")
  }

  const handleAddFeed = () => {
    handleNavigateToConfigure("create")
  }

  const handleContinueToConfiguration = () => {
    setCurrentStep("configure")
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto p-6">
        <OracleNav activeTab="build" />
        
        {/* Real-time connection status */}
        <ConnectionStatus 
          connectionState={connection}
          isRealtimeConnected={isRealtimeConnected}
          lastUpdateTime={lastUpdateTime}
          updateCount={updateCount}
        />
        
        {/* WebSocket Debug Console */}
        <WebSocketDebugger 
          messages={recentMessages}
          isConnected={connection.isConnected}
        />
        
        {/* Render Current Step */}
        {currentStep === "overview" && (
          <OverviewStep
            oracles={oracles || []}
            selectedOracleId={selectedOracleId}
            setSelectedOracleId={setSelectedOracleId}
            selectedOracle={selectedOracle}
            selectedPriceFeedId={selectedPriceFeedId}
            setSelectedPriceFeedId={setSelectedPriceFeedId}
            onCreateNew={handleCreateNew}
            onNavigateToConfigure={(source: string) => handleNavigateToConfigure(source as ConfigureSource)}
          />
        )}
        {currentStep === "create" && (
          <CreateStep
            formData={oracleFormData}
            onFormChange={handleFormChange}
            configuredPriceFeeds={configuredPriceFeeds}
            onAddFeed={handleAddFeed}
            onNext={handleContinueToConfiguration}
            onBack={handleBackToOverview}
          />
        )}
        {currentStep === "configure" && (
          <ConfigureStep
            onBack={handleBackFromConfigure}
            onAddFeed={handleAddFeed}
            backLabel={configureSource === "create" ? "Back to New Oracle" : "Back to Your Oracles"}
            oracleId={selectedOracleId}
          />
        )}
      </div>
    </div>
  )
}
