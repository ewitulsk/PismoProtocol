
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/oracle-builder/Dashboard"));

export default function DashboardPage() {
  return <Dashboard />;
}
