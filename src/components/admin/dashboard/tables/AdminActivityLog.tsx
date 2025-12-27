"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { formatTimeAgo } from "@/lib/utils/date-formatter";

interface AdminActivity {
    id: string;
    type: string;
    description: string;
    timestamp: Date;
    tags?: Record<string, string>;
}

interface AdminActivityLogProps {
    activities: AdminActivity[];
    isLoading?: boolean;
}

const ACTIVITY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    "admin.session.revoke": { icon: "logout", label: "Session Revoked", color: "text-yellow-400" },
    "admin.permission_request.approve.count": { icon: "check_circle", label: "Request Approved", color: "text-green-400" },
    "admin.permission_request.reject.count": { icon: "cancel", label: "Request Rejected", color: "text-red-400" },
    "admin.policy.change.count": { icon: "policy", label: "Auth Model Updated", color: "text-blue-400" },
    "admin.pipeline.graph.save.count": { icon: "account_tree", label: "Pipeline Saved", color: "text-purple-400" },
    "admin.pipeline.secret.rotate.count": { icon: "key", label: "Secret Rotated", color: "text-orange-400" },
};

/**
 * Panel I: Admin Activity
 * Table view of recent admin actions
 */
export function AdminActivityLog({ activities, isLoading }: AdminActivityLogProps) {
    const isEmpty = !activities || activities.length === 0;

    const getActivityConfig = (type: string) => {
        return ACTIVITY_CONFIG[type] || { icon: "info", label: type, color: "text-gray-400" };
    };

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Admin Activity</h3>

                {isLoading ? (
                    <div className="h-[200px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[200px] flex items-center justify-center text-gray-400">
                        <div className="text-center">
                            <Icon name="history" className="text-4xl mb-2" />
                            <p>No recent admin activity</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {activities.map((activity) => {
                            const config = getActivityConfig(activity.type);
                            return (
                                <div
                                    key={activity.id}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <div className={`flex-shrink-0 ${config.color}`}>
                                        <Icon name={config.icon} size="md" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white font-medium">
                                            {config.label}
                                        </div>
                                        {activity.description && (
                                            <div className="text-xs text-gray-400 truncate">
                                                {activity.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-shrink-0 text-xs text-gray-500">
                                        {formatTimeAgo(activity.timestamp)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
