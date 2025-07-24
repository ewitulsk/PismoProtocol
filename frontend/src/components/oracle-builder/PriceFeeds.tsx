import React from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

interface PriceFeedsProps {
  selectedOracle: any
}


const PriceFeeds: React.FC<PriceFeedsProps> = ({ selectedOracle }) => {
  const [selectedPriceFeed, setSelectedPriceFeed] = React.useState<string>("");

  // When the oracle changes, immediately reset selected price feed to the new oracle's first feed
  React.useEffect(() => {
    if (selectedOracle?.priceFeeds && selectedOracle.priceFeeds.length > 0) {
      setSelectedPriceFeed(selectedOracle.priceFeeds[0].id);
    } else {
      setSelectedPriceFeed("");
    }
  }, [selectedOracle]);

  const selectedFeed = selectedOracle?.priceFeeds.find((feed: any) => feed.id === selectedPriceFeed);

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-4 border-b border-gray-800">
        <CardTitle className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-green-400" />
          Price Feeds
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Feed List */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Available Feeds</h3>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
              {selectedOracle?.priceFeeds.map((feed: any) => (
                <div
                  key={feed.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPriceFeed === feed.id
                      ? "bg-blue-900/30 border-blue-700 text-blue-100"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                  }`}
                  onClick={() => setSelectedPriceFeed(feed.id)}
                >
                  <div className="font-medium text-sm">{feed.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{feed.feedId}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Configuration</h3>
            {selectedFeed && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-400">Price Feed ID:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.feedId}
                    disabled
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400">Underlying URL:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.underlyingUrl}
                    disabled
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400">Response Field:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.responseField}
                    disabled
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400">Live URL:</label>
                  <Input
                    className="bg-gray-800 border-gray-700 text-gray-300 mt-1 cursor-not-allowed"
                    value={selectedFeed.liveUrl}
                    disabled
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
          <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 bg-transparent">
            Test Connection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PriceFeeds;
