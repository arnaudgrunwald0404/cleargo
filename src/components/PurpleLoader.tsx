"use client";

interface PurpleLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PurpleLoader({ size = "md", className = "" }: PurpleLoaderProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-4",
    lg: "h-12 w-12 border-4",
  };

  return (
    <div className={`animate-spin ${sizeClasses[size]} border-indigo-600 border-t-transparent rounded-full ${className}`} />
  );
}

