import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Code, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { useCurrentAccount } from '@mysten/dapp-kit'
import { useOracleBuilder } from "@/hooks/useOracleBuilder"
import { PriceFeedFormData } from "@/types/oracleBuilder"

interface ConfigureStepProps {
  onBack: () => void
  onAddFeed: () => void
  backLabel: string
  oracleId?: string
}

const ConfigureStep: React.FC<ConfigureStepProps> = ({ 
  onBack, 
  onAddFeed, 
  backLabel, 
  oracleId
}) => {
  const currentAccount = useCurrentAccount();
  const oracleBuilder = useOracleBuilder();
  
  const [formData, setFormData] = useState<PriceFeedFormData>({
    id: '',
    name: '',
    feedId: '',
    api_key: '',
    underlying_url: 'https://api.example.com/price',
    response_field: 'price',
    live_url: 'https://oracle.example.com/feed',
  });

  const [creationStatus, setCreationStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleInputChange = (field: keyof PriceFeedFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreatePriceFeed = async () => {
    if (!currentAccount) {
      setErrorMessage('Please connect your wallet first');
      setCreationStatus('error');
      return;
    }

    if (!oracleId) {
      setErrorMessage('Oracle ID is required. Please create an oracle first.');
      setCreationStatus('error');
      return;
    }

    if (!formData.api_key.trim() || !formData.underlying_url.trim() || !formData.response_field.trim() || !formData.live_url.trim()) {
      setErrorMessage('All fields are required');
      setCreationStatus('error');
      return;
    }

    setCreationStatus('creating');
    setErrorMessage('');

    try {
      const oracleRef = {
        objectId: oracleId,
        version: '1',
        digest: '',
      };

      const result = await oracleBuilder.createNewPriceFeed(oracleRef, formData);
      
      if (result.success) {
        setCreationStatus('success');
        setTimeout(() => {
          onBack();
        }, 2000);
      } else {
        setCreationStatus('error');
        setErrorMessage(result.error || 'Failed to create price feed');
      }
    } catch (error) {
      setCreationStatus('error');
      setErrorMessage('An unexpected error occurred');
      console.error('Price feed creation error:', error);
    }
  };

  const isFormValid = formData.api_key.trim() && 
                     formData.underlying_url.trim() && 
                     formData.response_field.trim() && 
                     formData.live_url.trim();

  return (
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
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-100">API Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">API Key:</Label>
              <Input
                type="password"
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="Enter your API key..."
                value={formData.api_key}
                onChange={(e) => handleInputChange('api_key', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">Underlying URL:</Label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="https://api.example.com/data"
                value={formData.underlying_url}
                onChange={(e) => handleInputChange('underlying_url', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">Response Field:</Label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="price"
                value={formData.response_field}
                onChange={(e) => handleInputChange('response_field', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">Live URL:</Label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="https://oracle.example.com/feed"
                value={formData.live_url}
                onChange={(e) => handleInputChange('live_url', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Preview */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-100">Configuration Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-400">API Key:</span>
                <span className="text-gray-100 ml-2">
                  {formData.api_key ? '••••••••' : 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Data Source:</span>
                <span className="text-gray-100 ml-2 break-all">
                  {formData.underlying_url || 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Response Field:</span>
                <span className="text-gray-100 ml-2">
                  {formData.response_field || 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Live Endpoint:</span>
                <span className="text-gray-100 ml-2 break-all">
                  {formData.live_url || 'Not set'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Messages */}
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
            Price feed created successfully!
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mt-6">
        <Button 
          variant="outline" 
          className="border-gray-600 text-gray-300 hover:bg-gray-800 bg-transparent"
          onClick={onBack}
          disabled={creationStatus === 'creating'}
        >
          Cancel
        </Button>
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" 
          onClick={handleCreatePriceFeed}
          disabled={!isFormValid || creationStatus === 'creating' || !currentAccount}
        >
          {creationStatus === 'creating' && <Loader2 className="w-4 h-4 animate-spin" />}
          {creationStatus === 'creating' ? 'Creating Price Feed...' : 'Create Price Feed'}
        </Button>
      </div>
    </div>
  );
};

export default ConfigureStep;
