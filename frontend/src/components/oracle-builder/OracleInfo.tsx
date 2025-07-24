import React from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Database } from "lucide-react"

interface OracleInfoProps {
  selectedOracle: any
}

const OracleInfo: React.FC<OracleInfoProps> = ({ selectedOracle }) => (
  <Card className="bg-gray-900 border-gray-800">
    <CardHeader className="pb-4 border-b border-gray-800">
      <div className="flex items-center gap-3">
        <Database className="w-6 h-6 text-blue-400" />
        <CardTitle className="text-2xl font-bold text-gray-100">
          {selectedOracle ? selectedOracle.name : "Select an Oracle"}
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent className="p-6">
      {selectedOracle ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium text-gray-400">Created By</span>
              <div className="text-gray-100 mt-1">{selectedOracle.createdBy}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-400">Usage Fee</span>
              <div className="text-gray-100 mt-1">{selectedOracle.usageFee}</div>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium text-gray-400">Oracle ID</span>
              <div className="text-gray-100 mt-1 font-mono">{selectedOracle.id}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-400">Trusted By</span>
              <div className="text-gray-100 mt-1">{selectedOracle.trustedBy}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-gray-400">Select an oracle to view details.</div>
      )}
    </CardContent>
  </Card>
)

export default OracleInfo;
