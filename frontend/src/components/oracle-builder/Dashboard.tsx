"use client"

import React, { useState } from "react"
import OracleNav from "./OracleNav"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, Filter } from "lucide-react"
import OracleSelector from "./OracleSelector"
import OracleInfo from "./OracleInfo"
import PriceFeeds from "./PriceFeeds"

interface OracleDashboardProps {
  onNavigate?: (tab: string) => void
}

export default function Component({ onNavigate }: OracleDashboardProps) {
  // Dynamic oracle listings state
  const [oracles, setOracles] = useState([
    {
      name: "ETH/USD Price Oracle",
      type: "Price Feed",
      status: "Live",
      id: "eth_usd_001",
      createdBy: "0x742d...4f2a",
      usageFee: "0.001 ETH per query",
      trustedBy: "1,247 contracts",
      priceFeeds: [
        {
          id: "coinbase_eth_usd",
          name: "Coinbase ETH/USD",
          feedId: "coinbase_eth_usd",
          underlyingUrl: "https://api.coinbase.com/v2/exchange-rates",
          responseField: "data.rates.USD",
          liveUrl: "https://oracle.example.com/eth-usd",
        },
        {
          id: "binance_eth_usd",
          name: "Binance ETH/USD",
          feedId: "binance_eth_usd",
          underlyingUrl: "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
          responseField: "price",
          liveUrl: "https://oracle.example.com/eth-usd-binance",
        },
        {
          id: "kraken_eth_usd",
          name: "Kraken ETH/USD",
          feedId: "kraken_eth_usd",
          underlyingUrl: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
          responseField: "result.XETHZUSD.c[0]",
          liveUrl: "https://oracle.example.com/eth-usd-kraken",
        },
      ],
    },
    {
      name: "BTC/USD Price Oracle",
      type: "Price Feed",
      status: "Live",
      id: "btc_usd_001",
      createdBy: "0x1234...abcd",
      usageFee: "0.001 BTC per query",
      trustedBy: "1,000 contracts",
      priceFeeds: [
        {
          id: "coinbase_btc_usd",
          name: "Coinbase BTC/USD",
          feedId: "coinbase_btc_usd",
          underlyingUrl: "https://api.coinbase.com/v2/exchange-rates",
          responseField: "data.rates.USD",
          liveUrl: "https://oracle.example.com/btc-usd",
        },
        {
          id: "binance_btc_usd",
          name: "Binance BTC/USD",
          feedId: "binance_btc_usd",
          underlyingUrl: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
          responseField: "price",
          liveUrl: "https://oracle.example.com/btc-usd-binance",
        },
      ],
    },
    {
      name: "Weather Data Oracle",
      type: "External API",
      status: "Inactive",
      id: "weather_001",
      createdBy: "0x5678...efgh",
      usageFee: "0.01 ETH per query",
      trustedBy: "500 contracts",
      priceFeeds: [
        {
          id: "openweather",
          name: "OpenWeatherMap",
          feedId: "openweather",
          underlyingUrl: "https://api.openweathermap.org/data/2.5/weather",
          responseField: "main.temp",
          liveUrl: "https://oracle.example.com/weather-openweather",
        },
      ],
    },
    {
      name: "Sports Results Oracle",
      type: "Event Data",
      status: "Live",
      id: "sports_001",
      createdBy: "0x9abc...def0",
      usageFee: "0.005 ETH per query",
      trustedBy: "300 contracts",
      priceFeeds: [
        {
          id: "espn_nba",
          name: "ESPN NBA Results",
          feedId: "espn_nba",
          underlyingUrl: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
          responseField: "events",
          liveUrl: "https://oracle.example.com/sports-espn-nba",
        },
      ],
    },
  ])

  // Oracle selection state
  const [selectedOracleId, setSelectedOracleId] = useState(oracles[0]?.id || "")
  // Compute selectedOracle on render
  const selectedOracle = oracles.find((oracle) => oracle.id === selectedOracleId)

  // Main content always uses selectedOracle

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
                  />
                </div>
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
              </CardContent>
            </Card>
            {/* Oracle Selector (Sidebar List) */}
            <OracleSelector
              oracles={oracles}
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
