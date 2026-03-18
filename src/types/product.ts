export interface Product {
  id: number;
  name: string;
  alias: string;
  description?: string;
  gitUrl?: string;
  structurizrWorkspaceName?: string;
  structurizrApiKey?: string;
  structurizrApiSecret?: string;
  structurizrApiUrl?: string;
  source?: string;
  critical?: string;
  ownerID?: number;
  uploadDate?: string;
  techProducts?: unknown[];
  discoveredInterfaces?: unknown[];
}
