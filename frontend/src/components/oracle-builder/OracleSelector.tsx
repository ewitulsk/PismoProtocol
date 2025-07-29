import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface OracleSelectorProps {
  oracles: any[]
  selectedOracleId: string
  setSelectedOracleId: (id: string) => void
}

const OracleSelector: React.FC<OracleSelectorProps> = ({ oracles, selectedOracleId, setSelectedOracleId }) => (
  <div className="space-y-3">
    {oracles.length === 0 ? (
      <div className="text-center py-8">
        <div className="text-gray-400 text-sm">
          Connect your wallet to view and manage your oracles
        </div>
      </div>
    ) : (
      oracles.map((oracle) => (
        <Card
          key={oracle.id}
          className={
            oracle.id === selectedOracleId
              ? "bg-gradient-to-r from-blue-900/50 to-blue-800/30 border-blue-700 cursor-pointer hover:from-blue-900/70 hover:to-blue-800/50 transition-all"
              : "bg-gray-900 border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
          }
          onClick={() => setSelectedOracleId(oracle.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={
                  oracle.id === selectedOracleId
                    ? "font-semibold text-blue-100"
                    : "font-medium text-gray-100"
                }>{oracle.name}</div>
                <div className={
                  oracle.id === selectedOracleId
                    ? "text-sm text-blue-300 mt-1"
                    : "text-sm text-gray-400 mt-1"
                }>{oracle.type}</div>
              </div>
              <Badge
                variant={oracle.id === selectedOracleId ? "secondary" : "outline"}
                className={
                  oracle.status === "Live"
                    ? "bg-green-900/50 text-green-300 border-green-700"
                    : "bg-gray-700/50 text-gray-400 border-gray-600"
                }
              >
                {oracle.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))
    )}
  </div>
)

export default OracleSelector;
