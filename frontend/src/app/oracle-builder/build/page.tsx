
import dynamic from "next/dynamic";

const Build = dynamic(() => import("@/components/oracle-builder/Build"));

export default function BuildPage() {
  return <Build />;
}
