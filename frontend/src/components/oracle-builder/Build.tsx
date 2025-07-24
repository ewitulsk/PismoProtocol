"use client"

import React, { useState } from "react"
import { mockOracles, Oracle, PriceFeed } from "./mockOracles"
import OracleNav from "./OracleNav"
import OverviewStep from "./steps/OverviewStep"
import CreateStep from "./steps/CreateStep"
import ConfigureStep from "./steps/ConfigureStep"

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
    feedId: string
    underlyingUrl: string
    responseField: string
    liveUrl: string
  }>
}

export default function BuildOracle({ onNavigate }: BuildOracleProps) {
  // State for create/configure steps (unaffected by overview selectors)
  const [oracleFormData, setOracleFormData] = useState<OracleFormData>({
    name: "",
    description: "",
    priceFeeds: [],
  })

  // Sample configured price feeds for the new oracle (mock)
  const [configuredPriceFeeds, setConfiguredPriceFeeds] = useState<Array<{
    id: string
    name: string
    feedId: string
    underlyingUrl: string
    responseField: string
    liveUrl: string
  }>>([
    {
      id: "new_feed_1",
      name: "Custom ETH Feed",
      feedId: "custom_eth_feed",
      underlyingUrl: "https://api.custom.com/eth",
      responseField: "price",
      liveUrl: "https://oracle.example.com/custom-eth",
    },
    {
      id: "new_feed_2",
      name: "Backup ETH Feed",
      feedId: "backup_eth_feed",
      underlyingUrl: "https://api.backup.com/eth",
      responseField: "data.price",
      liveUrl: "https://oracle.example.com/backup-eth",
    },
  ])
  const [currentStep, setCurrentStep] = useState<Step>("overview")
  const [configureSource, setConfigureSource] = useState<ConfigureSource>("overview")
  // Oracle selection
  const [selectedOracleId, setSelectedOracleId] = useState(mockOracles[0]?.id || "")
  const selectedOracle = mockOracles.find((oracle) => oracle.id === selectedOracleId)

  // Price feed selection
  const [selectedPriceFeedId, setSelectedPriceFeedId] = useState(selectedOracle?.priceFeeds[0]?.id || "")
  React.useEffect(() => {
    setSelectedPriceFeedId(selectedOracle?.priceFeeds[0]?.id || "")
  }, [selectedOracle])
  const selectedFeed = selectedOracle?.priceFeeds.find((feed) => feed.id === selectedPriceFeedId)

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
            oracles={mockOracles}
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
          />
        )}
      </div>
    </div>
  )
}
