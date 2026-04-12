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

function mergeClients(defaultClients: AuthClientConfig[], configuredClients: AuthClientConfig[]): AuthClientConfig[] {
  const merged = new Map<string, AuthClientConfig>();

  for (const client of defaultClients) {
    merged.set(client.clientId, client);
  }

  for (const client of configuredClients) {
    merged.set(client.clientId, client);
  }

  return Array.from(merged.values());
}

const LOCAL_CONNECTION: UpstreamConnectionConfig = {
  id: 'local',
  name: 'Local Development',
  type: 'dev',
};

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
    this.connections = mergeConnections([LOCAL_CONNECTION], configuredConnections);
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
