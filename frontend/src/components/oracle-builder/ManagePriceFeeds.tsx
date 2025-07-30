import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Database, Copy, Check } from "lucide-react"
import { UIOracle, UIPriceFeed } from "@/types/oracleBuilder"

interface ManagePriceFeedProps {
  oracle: UIOracle | undefined
  selectedPriceFeedId: string
  setSelectedPriceFeedId: (id: string) => void
  handleNavigateToConfigure: (source: string) => void
}

export const ManagePriceFeeds: React.FC<ManagePriceFeedProps> = ({
  oracle,
  selectedPriceFeedId,
  setSelectedPriceFeedId,
  handleNavigateToConfigure,
}) => {
  const [copiedFeedId, setCopiedFeedId] = React.useState<boolean>(false);
  const selectedFeed = oracle?.priceFeeds.find((feed) => feed.id === selectedPriceFeedId)

  // Reset copied state when selected price feed changes
  React.useEffect(() => {
    setCopiedFeedId(false);
  }, [selectedPriceFeedId]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFeedId(true);
      setTimeout(() => setCopiedFeedId(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const abbreviateFeedId = (feedId: string) => {
    // console.log("Abbreviating feed ID:", feedId);
    if (feedId?.length <= 30) return feedId;
    return `${feedId?.slice(0, 24)}...`;
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Manage Price Feeds
          </CardTitle>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            onClick={() => handleNavigateToConfigure("overview")}
          >
            <Plus className="w-4 h-4" />
            Add Feed
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Feed List */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Existing Feeds</h3>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
              {oracle?.priceFeeds.map((feed) => (
                <div
                  key={feed.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPriceFeedId === feed.id
                      ? "bg-blue-900/30 border-blue-700 text-blue-100"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                  }`}
                  onClick={() => setSelectedPriceFeedId(feed.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{feed.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{feed.description}</div>
                    </div>
                    {feed.isProtected && (
                      <div className="text-xs text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">Protected</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              * Protected feeds cannot be edited or removed to protect existing users
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Configuration</h3>
            {selectedFeed && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-400">Price Feed ID:</label>
                  <div className="relative mt-1">
                    <Input
                      className="bg-gray-800 border-gray-700 text-gray-300 pr-10 cursor-not-allowed"
                      value={abbreviateFeedId(selectedFeed.id)}
                      disabled
                      title={selectedFeed.id}
                    />
                    <button
                      onClick={() => copyToClipboard(selectedFeed.id)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors"
                      title="Copy full ID to clipboard"
                    >
                      {copiedFeedId ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400 hover:text-gray-300" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400">Underlying URL:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.underlying_url}
                    disabled
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400">Response Field:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.response_field}
                    disabled
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400">Live URL:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.live_url}
                    disabled
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
