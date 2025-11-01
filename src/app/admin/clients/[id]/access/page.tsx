"use client";

import { AccessControlClient } from "./access-control-client";
import { useClient } from "../client-context";

export default function AccessControlPage() {
  const client = useClient();
  
  return <AccessControlClient client={client} />;
}
