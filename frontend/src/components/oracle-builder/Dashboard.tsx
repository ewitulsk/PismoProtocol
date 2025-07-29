"use client"

import React, { useState } from "react"
import OracleNav from "./OracleNav"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, Filter, Loader2, AlertCircle } from "lucide-react"
import OracleSelector from "./OracleSelector"
import OracleInfo from "./OracleInfo"
import PriceFeeds from "./PriceFeeds"
import { useOraclesWithPriceFeeds } from "@/hooks/useOracleBuilderData"

interface OracleDashboardProps {
  onNavigate?: (tab: string) => void
}

// Loading skeleton component
const LoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-2 text-gray-400">Loading oracles...</span>
    </div>
    {[1, 2, 3].map((i) => (
      <div key={i} className="animate-pulse">
        <div className="h-20 bg-gray-800 rounded-lg border border-gray-700"></div>
      </div>
    ))}
  </div>
);

// Error display component
const ErrorDisplay = ({ error }: { error: Error }) => (
  <div className="flex items-center justify-center py-8 text-red-400">
    <AlertCircle className="w-6 h-6 mr-2" />
    <span>Error loading oracles: {error.message}</span>
  </div>
);

export default function Component({ onNavigate }: OracleDashboardProps) {
  // Fetch real oracle data
  const { data: oracles, isLoading, error } = useOraclesWithPriceFeeds();
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOracleId, setSelectedOracleId] = useState("")
  
  // Filter oracles based on search term
  const filteredOracles = oracles?.filter(oracle => 
    oracle.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    oracle.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    oracle.type?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];
  
  // Select first oracle by default when data loads
  React.useEffect(() => {
    if (filteredOracles.length > 0 && !selectedOracleId) {
      setSelectedOracleId(filteredOracles[0].id);
    }
  }, [filteredOracles, selectedOracleId]);
  
  const selectedOracle = filteredOracles.find(oracle => oracle.id === selectedOracleId);

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <OracleNav activeTab="oracles" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <OracleNav activeTab="oracles" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <ErrorDisplay error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto p-6">
        <OracleNav activeTab="oracles" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Search and Filters */}
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Search Oracles
                  </label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="Search by name or creator..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {/* Temporarily disabled filter input - keeping code for future use */}
                {/* 
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filters
                  </label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="Filter by category, fee, etc..."
                  />
                </div>
                */}
              </CardContent>
            </Card>
            {/* Oracle Selector (Sidebar List) */}
            <OracleSelector
              oracles={filteredOracles}
              selectedOracleId={selectedOracleId}
              setSelectedOracleId={setSelectedOracleId}
            />
          </div>
          {/* Right Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Oracle Info (Details) */}
            <OracleInfo selectedOracle={selectedOracle} />
            {/* Price Feeds (List and Config) */}
            <PriceFeeds
              selectedOracle={selectedOracle}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
