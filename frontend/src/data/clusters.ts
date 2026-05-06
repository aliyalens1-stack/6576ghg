/**
 * Cluster → Services mapping (Sprint 34, Day 3)
 *
 * SINGLE source of truth for the home flow:
 *   user picks a cluster (Repair / Inspection / Selection / Delivery)
 *   → list of services rendered below is filtered by that cluster
 *
 * No more `POPULAR_SERVICES` static list. No more "Choose Inspection,
 * see Oil Change" desync.
 *
 * Service labels are i18n keys: `t(`home.svc.${key}`)`. Translations live
 * in `src/i18n/locales/{de,en,ru}.json` under `home.svc.*`.
 */
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ClusterId = 'repair' | 'inspection' | 'selection' | 'delivery';

export interface ClusterService {
  /** i18n key under `home.svc.*`. Also passed as `preselect` query param to /quick-request. */
  key: string;
  icon: IoniconName;
  /** semantic color hint: 'brand' (default amber), 'success' (green), 'warning' (orange) */
  tone: 'brand' | 'success' | 'warning';
}

export interface ClusterDef {
  id: ClusterId;
  /** i18n keys for cluster card */
  titleKey: string;
  subKey: string;
  icon: IoniconName;
  tone: 'brand' | 'success' | 'warning';
  /** services shown on home when this cluster is selected */
  services: ClusterService[];
}

export const CLUSTERS: Record<ClusterId, ClusterDef> = {
  repair: {
    id: 'repair',
    titleKey: 'home.clusters.repair_title',
    subKey: 'home.clusters.repair_sub',
    icon: 'construct',
    tone: 'brand',
    services: [
      { key: 'engine_wont_start', icon: 'car-outline', tone: 'brand' },
      { key: 'oil_change', icon: 'water-outline', tone: 'warning' },
      { key: 'brakes', icon: 'stop-circle-outline', tone: 'brand' },
      { key: 'diagnostics', icon: 'search-outline', tone: 'brand' },
      { key: 'electrical', icon: 'flash-outline', tone: 'brand' },
      { key: 'suspension', icon: 'swap-vertical-outline', tone: 'success' },
    ],
  },
  inspection: {
    id: 'inspection',
    titleKey: 'home.clusters.inspection_title',
    subKey: 'home.clusters.inspection_sub',
    icon: 'shield-checkmark',
    tone: 'success',
    services: [
      { key: 'pre_purchase_inspection', icon: 'shield-checkmark-outline', tone: 'success' },
      { key: 'computer_diagnostics', icon: 'hardware-chip-outline', tone: 'brand' },
      { key: 'vin_check', icon: 'document-text-outline', tone: 'brand' },
      { key: 'accident_check', icon: 'warning-outline', tone: 'warning' },
    ],
  },
  selection: {
    id: 'selection',
    titleKey: 'home.clusters.selection_title',
    subKey: 'home.clusters.selection_sub',
    icon: 'sparkles',
    tone: 'brand',
    services: [
      { key: 'car_selection', icon: 'sparkles-outline', tone: 'brand' },
      { key: 'budget_match', icon: 'wallet-outline', tone: 'success' },
      { key: 'negotiation_help', icon: 'chatbubbles-outline', tone: 'brand' },
      { key: 'mobile_de_link', icon: 'link-outline', tone: 'brand' },
    ],
  },
  delivery: {
    id: 'delivery',
    titleKey: 'home.clusters.delivery_title',
    subKey: 'home.clusters.delivery_sub',
    icon: 'rocket',
    tone: 'warning',
    services: [
      { key: 'car_delivery', icon: 'rocket-outline', tone: 'warning' },
      { key: 'evacuation', icon: 'cube-outline', tone: 'warning' },
      { key: 'eu_import', icon: 'globe-outline', tone: 'brand' },
    ],
  },
};

export const CLUSTER_ORDER: ClusterId[] = ['repair', 'inspection', 'selection', 'delivery'];
