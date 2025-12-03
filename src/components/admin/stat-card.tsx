import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  icon: string;
  iconClassName?: string;
  iconBgClassName?: string;
  value: string | number;
  label: string;
  description?: React.ReactNode;
  className?: string;
}

export function StatCard({
  icon,
  iconClassName,
  iconBgClassName,
  value,
  label,
  description,
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center",
              iconBgClassName
            )}
          >
            <Icon name={icon} size="lg" className={iconClassName} />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-sm text-gray-400">{label}</p>
            {description && (
              <div className="text-xs text-gray-500 mt-1">{description}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
