import { cn } from "@/lib/utils/cn";
import type { IconSize } from "@/lib/types";

export interface IconProps {
  name: string;
  size?: IconSize;
  filled?: boolean;
  className?: string;
}

const sizeMap: Record<IconSize, string> = {
  xs: "!text-[20px]",
  sm: "!text-[24px]",
  md: "!text-[32px]",
  lg: "!text-[40px]",
  xl: "!text-[48px]",
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
  size = "xs",
  filled = false,
  className
}: IconProps) {
  return (
    <span
      className={cn(
        "material-symbols-outlined inline-flex items-center justify-center -translate-y-[2px]",
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
