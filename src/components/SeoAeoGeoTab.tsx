import { Brand } from "@/lib/brands";
import "./SeoAeoGeoTab.css";

interface Props { brand: Brand; }

export const SeoAeoGeoTab = ({ brand }: Props) => {
  return (
    <div className="aeo-tab" style={{ display: "flex", flexDirection: "column", gap: 16 }} />
  );
};
