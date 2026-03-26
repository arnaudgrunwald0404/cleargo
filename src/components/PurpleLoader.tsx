"use client";

import { Loader } from "@/components/hoberman";

const SIZE_MAP = { sm: 24, md: 48, lg: 64 } as const;

interface PurpleLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, centers the loader in the viewport (use for full-page loading states) */
  fullPage?: boolean;
}

export function PurpleLoader({ size = "md", className, fullPage }: PurpleLoaderProps) {
  const loader = <Loader size={SIZE_MAP[size]} className={className} />;

  if (!fullPage) return loader;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 140px)", width: "100%" }}>
      {loader}
    </div>
  );
}
