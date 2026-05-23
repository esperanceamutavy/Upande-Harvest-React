import type { ClientId } from './clients';

/**
 * Port of instance_mapper.dart:1-18.
 * Maps known instance URLs → ClientId. Trailing slashes are stripped before lookup.
 */
const URL_MAP: Record<string, ClientId> = {
  'https://kikwetu.upande.com': 'kikwetu',
  'https://kikwetu-production.jh.frappe.cloud': 'kikwetu',
  'https://kaitet-group.upande.com': 'kaitet',
  'https://kaitet-group.c.frappe.cloud': 'kaitet',
  'https://upande-kaitet-group-staging.frappe.cloud': 'kaitet',
  'https://upande-insights.frappe.cloud': 'demo',
  'http://81.17.101.149:8082': 'kaitet',
  'http://192.168.43.97:8001': 'kaitet',
  'https://mona-flowers-staging.upande.com': 'mona',
  'https://xflora.fsn.frappe.cloud': 'xflora',
};

/** Returns null for unrecognised / development URLs. */
export function getClientIdByUrl(url: string): ClientId | null {
  const normalised = url.replace(/\/$/, '');
  return URL_MAP[normalised] ?? null;
}
