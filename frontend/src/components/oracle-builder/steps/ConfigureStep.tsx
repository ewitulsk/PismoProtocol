import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Code, Loader2, CheckCircle, AlertCircle, TestTube, Copy } from "lucide-react"
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
    description: '',
    api_key: '',
    api_key_config: '',
    underlying_url: 'https://api.example.com/price',
    response_field: 'price',
    live_url: 'https://oracle.example.com/feed',
  });

  const [creationStatus, setCreationStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // API testing state
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiTestResponse, setApiTestResponse] = useState<any>(null);
  const [apiTestError, setApiTestError] = useState<string>('');

  const handleInputChange = (field: keyof PriceFeedFormData, value: string) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };
      
      // Clear API key config when API key is cleared
      if (field === 'api_key' && !value.trim()) {
        updated.api_key_config = '';
      }
      
      return updated;
    });
    
    // Clear API test results when URL or API configuration changes
    if (field === 'underlying_url' || field === 'api_key' || field === 'api_key_config') {
      setApiTestStatus('idle');
      setApiTestResponse(null);
      setApiTestError('');
    }
  };

  const testApiUrl = async () => {
    if (!formData.underlying_url.trim()) {
      setApiTestError('Please enter an underlying URL first');
      setApiTestStatus('error');
      return;
    }

    setApiTestStatus('testing');
    setApiTestError('');
    setApiTestResponse(null);

    try {
      // Parse API key configuration if provided
      let headers: Record<string, string> = {};
      let queryParams: Record<string, string> = {};

      if (formData.api_key.trim() && formData.api_key_config.trim()) {
        try {
          // Try to parse as JSON first (for header configuration)
          const config = JSON.parse(formData.api_key_config);
          
          if (config.headers) {
            headers = { ...headers, ...config.headers };
            // Replace placeholder with actual API key
            Object.keys(headers).forEach(key => {
              if (typeof headers[key] === 'string') {
                headers[key] = headers[key].replace('{{API_KEY}}', formData.api_key);
              }
            });
          }
          
          if (config.query) {
            queryParams = config.query;
            Object.keys(queryParams).forEach(key => {
              if (typeof queryParams[key] === 'string') {
                queryParams[key] = queryParams[key].replace('{{API_KEY}}', formData.api_key);
              }
            });
          }
        } catch (parseError) {
          // If not JSON, treat as simple header format like "X-API-Key: {{API_KEY}}"
          const lines = formData.api_key_config.split('\n');
          lines.forEach(line => {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value) {
              headers[key] = value.replace('{{API_KEY}}', formData.api_key);
            }
          });
        }
      }

      // Use our backend proxy API to avoid CORS issues
      const response = await fetch('/api/test-price-feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formData.underlying_url,
          headers,
          queryParams,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      setApiTestResponse(result.data);
      setApiTestStatus('success');
    } catch (error) {
      console.error('API test error:', error);
      setApiTestError(error instanceof Error ? error.message : 'Failed to test API URL');
      setApiTestStatus('error');
    }
  };

  const copyResponseToClipboard = async () => {
    if (apiTestResponse) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(apiTestResponse, null, 2));
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  const extractResponseField = (response: any, fieldPath: string): any => {
    if (!response || !fieldPath.trim()) {
      return undefined;
    }

    try {
      // Split the field path by dots to handle nested properties
      const pathParts = fieldPath.split('.');
      let value = response;
      
      for (const part of pathParts) {
        if (value === null || value === undefined) {
          return undefined;
        }
        
        // Handle array indices if the part is a number
        if (Array.isArray(value) && !isNaN(Number(part))) {
          value = value[Number(part)];
        } else if (typeof value === 'object') {
          value = value[part];
        } else {
          return undefined;
        }
      }
      
      return value;
    } catch (error) {
      return undefined;
    }
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

    if (!formData.name.trim() || !formData.description.trim() || !formData.underlying_url.trim() || !formData.response_field.trim() || !formData.live_url.trim()) {
      setErrorMessage('Name, description, underlying URL, response field, and live URL are required');
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

  const isFormValid = formData.name.trim() &&
                     formData.description.trim() && 
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
              <Label className="text-sm font-medium text-gray-300">Name:</Label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="Enter price feed name..."
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">Description:</Label>
              <Input
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="Describe what this price feed provides..."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">API Key (Optional):</Label>
              <Input
                type="password"
                className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                placeholder="Enter your API key (if required)..."
                value={formData.api_key}
                onChange={(e) => handleInputChange('api_key', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">API Key Config:</Label>
              <Input
                className={`bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500 ${
                  !formData.api_key.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                placeholder='{"headers": {"X-API-Key": "{{API_KEY}}"}} or {"query": {"apikey": "{{API_KEY}}"}}'
                value={formData.api_key_config}
                onChange={(e) => handleInputChange('api_key_config', e.target.value)}
                disabled={!formData.api_key.trim()}
              />
              {formData.api_key.trim() && (
                <p className="text-xs text-gray-400">
                  Use JSON format or simple format. Examples:<br/>
                  • <code className="text-gray-300">{`{"headers": {"X-API-Key": "{{API_KEY}}"}}`}</code><br/>
                  • <code className="text-gray-300">{`{"query": {"apikey": "{{API_KEY}}"}}`}</code><br/>
                  • <code className="text-gray-300">Authorization: Bearer {`{{API_KEY}}`}</code>
                </p>
              )}
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

        {/* Right Panel - Preview and API Testing */}
        <div className="space-y-6">
          {/* Configuration Preview */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-gray-100">Configuration Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-400">Name:</span>
                  <span className="text-gray-100 ml-2">
                    {formData.name || 'Not set'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Description:</span>
                  <span className="text-gray-100 ml-2">
                    {formData.description || 'Not set'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">API Key:</span>
                  <span className="text-gray-100 ml-2">
                    {formData.api_key ? '••••••••' : 'Not provided'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">API Key Config:</span>
                  <span className="text-gray-100 ml-2">
                    {formData.api_key_config || 'Not set'}
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

          {/* API Testing Widget */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <TestTube className="w-5 h-5 text-green-400" />
                API Response Tester
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Test your API URL to see the response structure and determine the correct response field.
                </p>
                
                <Button
                  onClick={testApiUrl}
                  disabled={!formData.underlying_url.trim() || apiTestStatus === 'testing'}
                  className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                >
                  {apiTestStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {apiTestStatus === 'testing' ? 'Testing API...' : 'Test API URL'}
                </Button>

                {/* API Test Results */}
                {apiTestStatus === 'error' && (
                  <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-red-300 text-sm">
                      <div className="font-semibold mb-1">API Test Failed</div>
                      <div>{apiTestError}</div>
                    </div>
                  </div>
                )}

                {apiTestStatus === 'success' && apiTestResponse && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="text-green-300 text-sm font-semibold">
                        API Test Successful
                      </span>
                    </div>
                    
                    {/* Response Field Value */}
                    {formData.response_field.trim() && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-300">
                          Response Field Value: <code className="text-blue-400">{formData.response_field}</code>
                        </Label>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                          {(() => {
                            const extractedValue = extractResponseField(apiTestResponse, formData.response_field);
                            if (extractedValue === undefined) {
                              return (
                                <div className="text-red-300 text-sm">
                                  <AlertCircle className="w-4 h-4 inline mr-2" />
                                  Field "{formData.response_field}" not found in response
                                </div>
                              );
                            }
                            return (
                              <div className="text-green-300 text-sm">
                                <span className="text-gray-400">Value: </span>
                                <code className="text-green-300 bg-green-900/20 px-2 py-1 rounded">
                                  {typeof extractedValue === 'object' 
                                    ? JSON.stringify(extractedValue) 
                                    : String(extractedValue)
                                  }
                                </code>
                                <span className="text-gray-400 ml-2">
                                  (Type: {typeof extractedValue})
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                        {extractResponseField(apiTestResponse, formData.response_field) === undefined && (
                          <p className="text-xs text-yellow-400">
                            💡 Try paths like "price", "data.price", "result.value", or "0.price" for arrays
                          </p>
                        )}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-300">Full API Response:</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copyResponseToClipboard}
                          className="text-gray-400 hover:text-white p-1 h-auto"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 max-h-60 overflow-auto">
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(apiTestResponse, null, 2)}
                        </pre>
                      </div>
                      <p className="text-xs text-gray-400">
                        Use this structure to determine the correct "Response Field" path (e.g., "price", "data.price", "result.value").
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
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
