"use client";

import { createContext, useContext } from "react";
import type { ClientDetail } from "./actions";
import { useSetBreadcrumbLabel } from "@/components/layout/breadcrumb-context";

const ClientContext = createContext<ClientDetail | null>(null);

export function ClientProvider({
  client,
  children,
}: {
  client: ClientDetail;
  children: React.ReactNode;
}) {
  // Set breadcrumb label for this client
  useSetBreadcrumbLabel(`/admin/clients/${client.id}`, client.name);

  return (
    <ClientContext.Provider value={client}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error("useClient must be used within ClientProvider");
  }
  return context;
}
