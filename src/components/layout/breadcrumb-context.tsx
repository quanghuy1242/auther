"use client";

import * as React from "react";

type BreadcrumbContextType = {
    labels: Record<string, string>;
    setLabel: (path: string, label: string) => void;
};

const BreadcrumbContext = React.createContext<BreadcrumbContextType | undefined>(undefined);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
    const [labels, setLabels] = React.useState<Record<string, string>>({});

    const setLabel = React.useCallback((path: string, label: string) => {
        setLabels((prev) => {
            if (prev[path] === label) return prev;
            return { ...prev, [path]: label };
        });
    }, []);

    return (
        <BreadcrumbContext.Provider value={{ labels, setLabel }}>
            {children}
        </BreadcrumbContext.Provider>
    );
}

export function useBreadcrumbContext() {
    const context = React.useContext(BreadcrumbContext);
    if (!context) {
        throw new Error("useBreadcrumbContext must be used within a BreadcrumbProvider");
    }
    return context;
}

export function useSetBreadcrumbLabel(path: string, label: string | undefined | null) {
    const { setLabel } = useBreadcrumbContext();

    React.useEffect(() => {
        if (path && label) {
            setLabel(path, label);
        }
    }, [path, label, setLabel]);
}
