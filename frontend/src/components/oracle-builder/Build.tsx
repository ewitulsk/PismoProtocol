"use client"

import React, { useState } from "react"
import { useCurrentAccount } from '@mysten/dapp-kit'
import { useMyOracles } from "@/hooks/useOracleBuilderData"
import { useOracleBuilder } from "@/hooks/useOracleBuilder"
import { PriceFeedFormData } from "@/types/oracleBuilder"
import { UIOracle, UIPriceFeed } from "@/types/oracleBuilder"
import OracleNav from "./OracleNav"
import OverviewStep from "./steps/OverviewStep"
import CreateStep from "./steps/CreateStep"
import ConfigureStep from "./steps/ConfigureStep"
import { Loader2, AlertCircle } from "lucide-react"

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

export default function BuildOracle({ onNavigate }: BuildOracleProps) {
  const currentAccount = useCurrentAccount();
  const oracleBuilder = useOracleBuilder();
  
  // Fetch oracle data - only user's own oracles (empty if no wallet)
  const { data: oracles, isLoading, error } = useMyOracles();
  
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
