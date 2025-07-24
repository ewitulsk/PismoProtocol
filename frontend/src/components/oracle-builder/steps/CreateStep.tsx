import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Database } from "lucide-react"

interface OracleFormData {
  name: string
  description: string
  priceFeeds: Array<any>
}

interface CreateStepProps {
  formData: OracleFormData
  onFormChange: (field: keyof OracleFormData, value: string) => void
  configuredPriceFeeds: Array<any>
  onAddFeed: () => void
  onNext: () => void
  onBack: () => void
}

const CreateStep: React.FC<CreateStepProps> = ({
  formData,
  onFormChange,
  configuredPriceFeeds,
  onAddFeed,
  onNext,
  onBack,
}) => (
  <div className="max-w-6xl mx-auto">
    <div className="mb-6">
      <Button
        variant="ghost"
        className="text-gray-400 hover:text-white hover:bg-transparent mb-4 px-0"
        onClick={onBack}
      >
        ← Back to Your Oracles
      </Button>
      <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
        <Plus className="w-6 h-6 text-green-400" />
        New Oracle
      </h2>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel - Basic Info */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Name:</label>
            <Input
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
              placeholder="Enter oracle name..."
              value={formData.name}
              onChange={(e) => onFormChange("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Description:</label>
            <Textarea
              className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 min-h-[120px]"
              placeholder="Describe what your oracle does..."
              value={formData.description}
              onChange={(e) => onFormChange("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      {/* Right Panel - Price Feeds */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-gray-100">Price Feeds:</CardTitle>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              onClick={onAddFeed}
            >
              <Plus className="w-4 h-4" />
              Add Feed
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {configuredPriceFeeds.length > 0 ? (
            <div className="space-y-3">
              {configuredPriceFeeds.map((feed) => (
                <div key={feed.id} className="p-3 rounded-lg border bg-gray-800 border-gray-700">
                  <div className="font-medium text-sm text-gray-100">{feed.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{feed.feedId}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No price feeds configured yet</p>
              <p className="text-xs mt-1">Click "Add Feed" to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    <div className="flex justify-end gap-3 mt-6">
      <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 bg-transparent">
        Save Draft
      </Button>
      <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={onNext}>
        Continue to Configuration
      </Button>
    </div>
  </div>
)

export default CreateStep;
