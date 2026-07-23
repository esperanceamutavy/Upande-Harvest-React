export type ClientId = 'kikwetu' | 'kaitet' | 'mona' | 'xflora' | 'demo';

export interface ClientFeatures {
  harvesting: boolean;
  receiving: boolean;
  grading: boolean;
  packing: boolean;
  dispatch: boolean;
  discards: boolean;
  rejects: boolean;
  shelving: boolean;
  issuing: boolean;
  checkin: boolean;
  agriculture: boolean;
}

export interface ClientConfig {
  id: ClientId;
  displayName: string;
  features: ClientFeatures;
  /** Optional theme overrides; undefined means use Kikwetu defaults */
  primaryColor?: string;
  accentColor?: string;
}

/** Feature matrix sourced from entry_list_view.dart:242–715 */
export const CLIENT_REGISTRY: Record<ClientId, ClientConfig> = {
  kikwetu: {
    id: 'kikwetu',
    displayName: 'Kikwetu',
    features: {
      harvesting: true,
      receiving: true,
      grading: true,
      packing: true,
      dispatch: true,
      discards: true,
      rejects: true,
      shelving: false,
      issuing: false,
      checkin: false,
      agriculture: false,
    },
  },
  kaitet: {
    id: 'kaitet',
    displayName: 'Kaitet',
    features: {
      harvesting: true,
      receiving: true,
      grading: true,
      packing: true,
      dispatch: true,
      discards: true,
      rejects: false,
      shelving: true,
      issuing: true,
      checkin: true,
      agriculture: true,
    },
  },
  mona: {
    id: 'mona',
    displayName: 'Mona Flowers',
    features: {
      harvesting: true,
      receiving: true,
      grading: false,
      packing: false,
      dispatch: false,
      discards: true,
      rejects: false,
      shelving: true,
      issuing: false,
      checkin: false,
      agriculture: false,
    },
  },
  xflora: {
    id: 'xflora',
    displayName: 'Xflora',
    features: {
      harvesting: false,
      receiving: true,
      grading: false,
      packing: false,
      dispatch: false,
      discards: true,
      rejects: false,
      shelving: true,
      issuing: true,
      checkin: false,
      agriculture: false,
    },
  },
  demo: {
    id: 'demo',
    displayName: 'Demo',
    features: {
      harvesting: true,
      receiving: true,
      grading: true,
      packing: true,
      dispatch: true,
      discards: true,
      rejects: false,
      shelving: true,
      issuing: true,
      checkin: false,
      agriculture: true,
    },
  },
};

export function getClientConfig(id: ClientId): ClientConfig {
  return CLIENT_REGISTRY[id];
}
