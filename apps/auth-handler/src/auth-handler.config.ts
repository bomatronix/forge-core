import { Injectable } from '@nestjs/common';
import { getAuthHandlerRuntimeConfig, type AuthHandlerRuntimeConfig } from '@forge-core/core/auth/platform-tokens';
import type { AuthClientConfig, UpstreamConnectionConfig } from '@forge-core/core/auth/oauth.types';

const DEFAULT_CLIENTS: AuthClientConfig[] = [
  {
    clientId: 'forge-swagger-ui',
    name: 'Forge Swagger UI',
    type: 'public',
    firstParty: true,
    redirectUris: ['http://localhost:3001/api/docs/oauth2-redirect.html'],
    scopes: ['openid', 'profile', 'email', 'offline_access', 'agents:read', 'agents:write'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    defaultConnectionId: 'local',
  },
  {
    clientId: 'forge-local-spa',
    name: 'Forge Local SPA',
    type: 'public',
    firstParty: true,
    redirectUris: ['http://localhost:3000/callback'],
    scopes: ['openid', 'profile', 'email', 'offline_access', 'agents:read', 'agents:write'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    defaultConnectionId: 'local',
  },
  {
    clientId: 'agent-forge-web',
    name: 'Agent Forge Web',
    type: 'public',
    firstParty: true,
    redirectUris: [
      'http://localhost:3000/callback',
      'https://v0-agent-forge-ijs0b9e12-bomatra-1332s-projects.vercel.app/callback',
    ],
    scopes: ['openid', 'profile', 'email', 'offline_access', 'agents:read', 'agents:write'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    defaultConnectionId: 'clerk',
  },
  {
    clientId: 'forge-machine-client',
    clientSecret: 'forge-machine-secret',
    name: 'Forge Machine Client',
    type: 'confidential',
    firstParty: true,
    redirectUris: [],
    scopes: ['agents:read', 'agents:write'],
    grantTypes: ['client_credentials'],
    responseTypes: ['code'],
  },
  {
    clientId: 'forge-postman',
    name: 'Forge Postman',
    type: 'public',
    firstParty: true,
    redirectUris: [
      'https://oauth.pstmn.io/v1/callback',
      'https://oauth.pstmn.io/v1/browser-callback',
    ],
    scopes: ['openid', 'profile', 'email', 'offline_access', 'agents:read', 'agents:write'],
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    defaultConnectionId: 'local',
  },
];

function parseJsonEnv<T>(raw: string | undefined, fallback: T): T {
  if (!raw?.trim()) return fallback;
  return JSON.parse(raw) as T;
}

function parseExtraRedirectUris(): Map<string, string[]> {
  // AUTH_HANDLER_EXTRA_REDIRECT_URIS format:
  // JSON array of { clientId, redirectUri } pairs, e.g.:
  // [{"clientId":"agent-forge-web","redirectUri":"https://myapp.vercel.app/callback"}]
  const raw = process.env.AUTH_HANDLER_EXTRA_REDIRECT_URIS?.trim();
  if (!raw) return new Map();
  const extras = JSON.parse(raw) as Array<{ clientId: string; redirectUri: string }>;
  const map = new Map<string, string[]>();
  for (const { clientId, redirectUri } of extras) {
    const existing = map.get(clientId) ?? [];
    map.set(clientId, [...existing, redirectUri]);
  }
  return map;
}

function mergeClients(defaultClients: AuthClientConfig[], configuredClients: AuthClientConfig[]): AuthClientConfig[] {
  const merged = new Map<string, AuthClientConfig>();

  for (const client of defaultClients) {
    merged.set(client.clientId, client);
  }

  for (const client of configuredClients) {
    merged.set(client.clientId, client);
  }

  const extraRedirectUris = parseExtraRedirectUris();
  for (const [clientId, uris] of extraRedirectUris) {
    const client = merged.get(clientId);
    if (client) {
      merged.set(clientId, {
        ...client,
        redirectUris: [...new Set([...client.redirectUris, ...uris])],
      });
    }
  }

  return Array.from(merged.values());
}

const LOCAL_CONNECTION: UpstreamConnectionConfig = {
  id: 'local',
  name: 'Local Development',
  type: 'dev',
};

function buildClerkConnection(): UpstreamConnectionConfig | null {
  const discoveryUrl = process.env.AUTH_HANDLER_CLERK_DISCOVERY_URL?.trim();
  const clientId = process.env.AUTH_HANDLER_CLERK_CLIENT_ID?.trim();
  if (!discoveryUrl || !clientId) return null;

  return {
    id: process.env.AUTH_HANDLER_CLERK_CONNECTION_ID?.trim() || 'clerk',
    name: process.env.AUTH_HANDLER_CLERK_CONNECTION_NAME?.trim() || 'Clerk',
    type: 'oidc',
    discoveryUrl,
    clientId,
    clientSecret: process.env.AUTH_HANDLER_CLERK_CLIENT_SECRET?.trim(),
    scopes: process.env.AUTH_HANDLER_CLERK_SCOPES?.trim().split(/\s+/) ?? ['openid', 'profile', 'email'],
  };
}

function mergeConnections(
  defaultConnections: UpstreamConnectionConfig[],
  configuredConnections: UpstreamConnectionConfig[],
): UpstreamConnectionConfig[] {
  const merged = new Map<string, UpstreamConnectionConfig>();

  for (const connection of defaultConnections) {
    merged.set(connection.id, connection);
  }

  for (const connection of configuredConnections) {
    merged.set(connection.id, connection);
  }

  return Array.from(merged.values());
}

@Injectable()
export class AuthHandlerConfigService {
  private readonly runtimeConfig: AuthHandlerRuntimeConfig;
  private readonly clients: AuthClientConfig[];
  private readonly connections: UpstreamConnectionConfig[];

  constructor() {
    this.runtimeConfig = getAuthHandlerRuntimeConfig();
    const configuredClients = parseJsonEnv<AuthClientConfig[]>(
      process.env.AUTH_HANDLER_CLIENTS_JSON,
      [],
    );
    this.clients = mergeClients(DEFAULT_CLIENTS, configuredClients);

    const configuredConnections = parseJsonEnv<UpstreamConnectionConfig[]>(
      process.env.AUTH_HANDLER_CONNECTIONS_JSON,
      [],
    );
    const defaultConnections: UpstreamConnectionConfig[] = [LOCAL_CONNECTION];
    const clerkConnection = buildClerkConnection();
    if (clerkConnection) defaultConnections.push(clerkConnection);
    this.connections = mergeConnections(defaultConnections, configuredConnections);
  }

  getRuntimeConfig(): AuthHandlerRuntimeConfig {
    return this.runtimeConfig;
  }

  getClients(): AuthClientConfig[] {
    return this.clients;
  }

  getClient(clientId: string): AuthClientConfig | undefined {
    return this.clients.find(client => client.clientId === clientId);
  }

  getConnections(): UpstreamConnectionConfig[] {
    return this.connections;
  }

  getConnection(connectionId: string): UpstreamConnectionConfig | undefined {
    return this.connections.find(connection => connection.id === connectionId);
  }
}
