import React from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import OracleSelector from "../OracleSelector"
import { ManagePriceFeeds } from "../ManagePriceFeeds"
import { UIOracle, UIPriceFeed } from "@/types/oracleBuilder"

interface OverviewStepProps {
  oracles: UIOracle[]
  selectedOracleId: string
  setSelectedOracleId: (id: string) => void
  selectedOracle: UIOracle | undefined
  selectedPriceFeedId: string
  setSelectedPriceFeedId: (id: string) => void
  onCreateNew: () => void
  onNavigateToConfigure: (source: string) => void
  walletConnected?: boolean
}

const OverviewStep: React.FC<OverviewStepProps> = ({
  oracles,
  selectedOracleId,
  setSelectedOracleId,
  selectedOracle,
  selectedPriceFeedId,
  setSelectedPriceFeedId,
  onCreateNew,
  onNavigateToConfigure,
  walletConnected,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
    {/* Left Sidebar */}
    <div className="lg:col-span-2 space-y-6">
      {/* Header with New Oracle Button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-100">Your Oracles</h2>
        <Button
          className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
          onClick={onCreateNew}
        >
          <Plus className="w-4 h-4" />
          New Oracle
        </Button>
      </div>
      {/* Oracle List using shared OracleSelector */}
      <OracleSelector
        oracles={oracles}
        selectedOracleId={selectedOracleId}
        setSelectedOracleId={setSelectedOracleId}
        emptyState="build"
        walletConnected={walletConnected}
      />
    </div>
    {/* Right Panel - ManageOracle */}
    <div className="lg:col-span-3">
      <ManagePriceFeeds
        oracle={selectedOracle}
        selectedPriceFeedId={selectedPriceFeedId}
        setSelectedPriceFeedId={setSelectedPriceFeedId}
        handleNavigateToConfigure={onNavigateToConfigure}
      />
    </div>
  </div>
)

export default OverviewStep;
