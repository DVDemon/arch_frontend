/** Тег графа в Neo4j (см. graphTag в architect-graph-service) */
export type GraphTag = 'Global' | 'Local' | 'All';

/** Лейблы узлов в Neo4j (PascalCase, как в Cypher) */
export type C4Label =
  | 'SoftwareSystem'
  | 'Container'
  | 'Component'
  | 'DeploymentNode'
  | 'Environment'
  | 'ContainerInstance'
  | 'InfrastructureNode';

export interface C4Node {
  id: string;
  labels: string[];
  properties: Record<string, string | number | boolean>;
  name: string;
  description?: string;
  technology?: string;
}

export interface C4Relationship {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  properties: Record<string, string | number | boolean>;
}

/** Ребро из Cypher (n)-[r]->(m): type — тип связи в Neo4j; technology — из r.properties. */
export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  technology?: string;
}

/** Подпись на схеме: для типа Relationship при заданной technology показываем её вместо слова «Relationship». */
export function graphEdgeLabel(edge: GraphEdge): string {
  const t = edge.type.trim();
  // Подсказки на схемах и без того достаточно информативны:
  // :Child используем только как связку для навигации (к родителю/к drilldown), без подписи.
  if (t.toLowerCase() === 'child') return '';
  if (t.toLowerCase() === 'relationship' && edge.technology?.trim()) {
    return edge.technology.trim();
  }
  return edge.type;
}

export const C4_LABELS: { value: C4Label; display: string }[] = [
  { value: 'SoftwareSystem', display: 'Software System' },
  { value: 'Container', display: 'Container' },
  { value: 'Component', display: 'Component' },
  { value: 'DeploymentNode', display: 'Deployment Node' },
  { value: 'Environment', display: 'Environment' },
  { value: 'ContainerInstance', display: 'Container Instance' },
  { value: 'InfrastructureNode', display: 'Infrastructure Node' },
];

export const C4_COLORS: Record<string, string> = {
  SoftwareSystem: '#1A73E8',
  Container: '#00897B',
  Component: '#7B1FA2',
  DeploymentNode: '#E65100',
  Environment: '#455A64',
  ContainerInstance: '#00897B',
  InfrastructureNode: '#6D4C41',
};
