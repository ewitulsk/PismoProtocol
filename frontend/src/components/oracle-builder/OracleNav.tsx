import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { ReactNode } from "react"
import { ConnectButton } from "@mysten/dapp-kit"

interface OracleNavProps {
  activeTab: string
  className?: string
}

const tabs = [
  { key: "oracles", label: "Find" },
  { key: "build", label: "Manage" },
  { key: "about", label: "About" },
]

export default function OracleNav({ activeTab, className = "" }: OracleNavProps) {
  const router = useRouter()

  const handleNav = (tab: string) => {
    if (tab === "oracles") router.push("/oracle-builder/dashboard")
    else if (tab === "build") router.push("/oracle-builder/build")
    else if (tab === "about") router.push("/about")
  }

  return (
    <div className={`flex items-center justify-between mb-8`}>
      <div className="flex items-center gap-6">
        <span className="text-2xl font-bold text-white bg-gray-900 rounded-lg px-4 py-2 select-none">OracleBuilder</span>
        <div className={`flex gap-1 bg-gray-900 p-1 rounded-lg w-fit ${className}`}>
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant="ghost"
              className={
                tab.key === activeTab
                  ? "bg-blue-600 text-white hover:bg-blue-700 rounded-md px-6 py-2"
                  : "text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-md px-6 py-2"
              }
              onClick={() => handleNav(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
      
      {/* Connect Wallet Button with Oracle Builder styling */}
      <div className="oracle-builder-connect-wallet">
        <ConnectButton 
          connectText="Connect Wallet"
        />
      </div>
    </div>
  )
}
