import { cn } from "@/lib/utils/cn";
import type { IconSize } from "@/lib/types";

export interface IconProps {
  name: string;
  size?: IconSize;
  filled?: boolean;
  className?: string;
}

const sizeMap: Record<IconSize, string> = {
  sm: "text-[18px]",
  md: "text-[24px]",
  lg: "text-[32px]",
  xl: "text-[40px]",
};

/**
 * Icon component using Material Symbols Outlined
 * Renders icons from the Material Symbols font with customizable size and fill
 * 
 * @example
 * <Icon name="person" size="md" />
 * <Icon name="check_circle" filled className="text-green-500" />
 */
export function Icon({ 
  name, 
  size = "md", 
  filled = false, 
  className 
}: IconProps) {
  return (
    <span
      className={cn(
        "material-symbols-outlined",
        sizeMap[size],
        filled && "fill",
        className
      )}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
