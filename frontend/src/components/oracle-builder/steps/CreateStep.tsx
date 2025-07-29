import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Database, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { useCurrentAccount } from '@mysten/dapp-kit'
import { useOracleBuilder } from "@/hooks/useOracleBuilder"
import { abbreviateAddress } from "@/utils/addressUtils"

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
}) => {
  const currentAccount = useCurrentAccount();
  const oracleBuilder = useOracleBuilder();
  const [creationStatus, setCreationStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [transactionHash, setTransactionHash] = useState<string>('');

  const handleCreateOracle = async () => {
    if (!currentAccount) {
      setErrorMessage('Please connect your wallet first');
      setCreationStatus('error');
      return;
    }

    if (!formData.name.trim()) {
      setErrorMessage('Oracle name is required');
      setCreationStatus('error');
      return;
    }

    setCreationStatus('creating');
    setErrorMessage('');

    try {
      const result = await oracleBuilder.createNewOracle(formData.name, formData.description);
      
      if (result.success) {
        setCreationStatus('success');
        setTransactionHash(result.transactionHash || 'Created successfully');
        // Auto-proceed after successful creation
        setTimeout(() => {
          onNext();
        }, 5000);
      } else {
        setCreationStatus('error');
        setErrorMessage(result.error || 'Failed to create oracle');
      }
    } catch (error) {
      setCreationStatus('error');
      setErrorMessage('An unexpected error occurred');
      console.error('Oracle creation error:', error);
    }
  };

  const isFormValid = formData.name.trim().length > 0;

  return (
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
                  <div className="text-xs text-gray-400 mt-1">{feed.id}</div>
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

    {/* Status Message */}
    {creationStatus === 'error' && (
      <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800 rounded-lg mt-4">
        <AlertCircle className="w-5 h-5 text-red-400" />
        <span className="text-red-300 text-sm">{errorMessage}</span>
      </div>
    )}

    {creationStatus === 'success' && (
      <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg mt-4">
        <CheckCircle className="w-5 h-5 text-green-400" />
        <span className="text-green-300 text-sm">
          Oracle created successfully! {transactionHash && `Txn: ${abbreviateAddress(transactionHash, { withPrefix: true })}`}
        </span>
      </div>
    )}

    <div className="flex justify-end gap-3 mt-6">
      <Button 
        variant="outline" 
        className="border-gray-600 text-gray-300 hover:bg-gray-800 bg-transparent"
        disabled={creationStatus === 'creating'}
      >
        Save Draft
      </Button>
      <Button 
        className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" 
        onClick={handleCreateOracle}
        disabled={!isFormValid || creationStatus === 'creating' || !currentAccount}
      >
        {creationStatus === 'creating' && <Loader2 className="w-4 h-4 animate-spin" />}
        {creationStatus === 'creating' ? 'Creating Oracle...' : 'Create Oracle'}
      </Button>
    </div>
  </div>
  );
};

export default CreateStep;
