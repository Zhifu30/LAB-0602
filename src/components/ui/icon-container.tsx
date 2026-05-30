import * as React from "react";
import { cn } from "@/lib/utils";

interface IconContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "muted" | "blue" | "orange" | "teal" | "purple" | "amber";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const variantStyles = {
  default: "bg-icon-blue-bg text-icon-blue",
  primary: "bg-icon-blue-bg text-icon-blue",
  success: "bg-icon-green-bg text-icon-green",
  warning: "bg-icon-amber-bg text-icon-amber",
  danger: "bg-icon-red-bg text-icon-red",
  muted: "bg-muted text-muted-foreground",
  blue: "bg-icon-blue-bg text-icon-blue",
  orange: "bg-icon-orange-bg text-icon-orange",
  teal: "bg-icon-teal-bg text-icon-teal",
  purple: "bg-icon-purple-bg text-icon-purple",
  amber: "bg-icon-amber-bg text-icon-amber",
};

const sizeStyles = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const iconSizes = {
  sm: "[&>svg]:h-4 [&>svg]:w-4",
  md: "[&>svg]:h-5 [&>svg]:w-5",
  lg: "[&>svg]:h-7 [&>svg]:w-7",
};

const IconContainer = React.forwardRef<HTMLDivElement, IconContainerProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-xl transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        iconSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
IconContainer.displayName = "IconContainer";

export { IconContainer };
