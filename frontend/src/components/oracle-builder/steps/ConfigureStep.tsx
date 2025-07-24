import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Code, Wallet, Plus } from "lucide-react"

interface ConfigureStepProps {
  onBack: () => void
  onAddFeed: () => void
  backLabel: string
}

const ConfigureStep: React.FC<ConfigureStepProps> = ({ onBack, onAddFeed, backLabel }) => (
  <div className="max-w-6xl mx-auto">
    <div className="mb-6">
      <Button
        variant="ghost"
        className="text-gray-400 hover:text-white hover:bg-transparent mb-4 px-0"
        onClick={onBack}
      >
        ← {backLabel}
      </Button>
      <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
        <Code className="w-6 h-6 text-blue-400" />
        New Price Feed
      </h2>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel - API Configuration */}
      <div className="space-y-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">API Key:</label>
              <Input
                type="password"
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="Enter your API key..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Underlying URL:</label>
              <div className="flex gap-2">
                <Input
                  className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                  placeholder="https://api.example.com/data"
                />
                <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 bg-transparent">
                  Query
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Response Field:</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 min-h-[120px]">
                <p className="text-sm text-gray-400 italic">
                  This displays the JSON response from the API. The user selects a field, and it gets highlighted.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Right Panel - Wallet & Deployment Summary */}
      <div className="space-y-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-4 border-b border-gray-800">
            <CardTitle className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-400" />
              Wallet Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
              <span className="text-gray-300 font-mono text-sm">[wallet address]</span>
              <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700 bg-transparent">
                Connect Wallet
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-4 border-b border-gray-800">
            <CardTitle className="text-lg font-bold text-gray-100">Feed Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Underlying URL:</label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-400 cursor-not-allowed"
                value="[Underlying URL]"
                disabled
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Blurred API Key:</label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-400 cursor-not-allowed"
                value="[Blurred API Key]"
                disabled
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Selected JSON Field:</label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-400 cursor-not-allowed"
                value="[Selected JSON field]"
                disabled
              />
            </div>
          </CardContent>
        </Card>
        <Button className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" onClick={onAddFeed}>
          <Plus className="w-4 h-4" />
          Add Price Feed
        </Button>
      </div>
    </div>
  </div>
)

export default ConfigureStep;
