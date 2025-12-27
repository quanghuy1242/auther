"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

interface JwksHealthCardProps {
    data: {
        keyAgeDays: number;
        lastRotation: Date | null;
        rotationP95: number;
        keysPruned: number;
    };
    isLoading?: boolean;
}

/**
 * Panel H: JWKS Health
 * Stat card with status indicator for key rotation health
 */
export function JwksHealthCard({ data, isLoading }: JwksHealthCardProps) {
    const getHealthStatus = () => {
        if (data.keyAgeDays > 30) return { status: "critical", color: "bg-red-500", text: "Rotate Now" };
        if (data.keyAgeDays > 25) return { status: "warning", color: "bg-yellow-500", text: "Rotate Soon" };
        return { status: "healthy", color: "bg-green-500", text: "Healthy" };
    };

    const health = getHealthStatus();

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">JWKS Health</h3>
                    <Badge
                        variant={health.status === "healthy" ? "success" : health.status === "warning" ? "warning" : "danger"}
                    >
                        {health.text}
                    </Badge>
                </div>

                {isLoading ? (
                    <div className="h-[150px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {/* Key Age */}
                        <div className="p-4 rounded-lg bg-white/5">
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                                <Icon name="schedule" size="sm" />
                                Key Age
                            </div>
                            <div className={`text-2xl font-bold ${data.keyAgeDays > 30 ? "text-red-400" :
                                data.keyAgeDays > 25 ? "text-yellow-400" : "text-white"
                                }`}>
                                {data.keyAgeDays} days
                            </div>
                        </div>

                        {/* Last Rotation */}
                        <div className="p-4 rounded-lg bg-white/5">
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                                <Icon name="sync" size="sm" />
                                Last Rotation
                            </div>
                            <div className="text-lg font-semibold text-white">
                                {data.lastRotation
                                    ? data.lastRotation.toLocaleDateString()
                                    : "Never"
                                }
                            </div>
                        </div>

                        {/* Rotation P95 */}
                        <div className="p-4 rounded-lg bg-white/5">
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                                <Icon name="speed" size="sm" />
                                Rotation P95
                            </div>
                            <div className="text-lg font-semibold text-white">
                                {data.rotationP95.toFixed(0)}ms
                            </div>
                        </div>

                        {/* Keys Pruned */}
                        <div className="p-4 rounded-lg bg-white/5">
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                                <Icon name="delete_sweep" size="sm" />
                                Keys Pruned
                            </div>
                            <div className="text-lg font-semibold text-white">
                                {data.keysPruned}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
