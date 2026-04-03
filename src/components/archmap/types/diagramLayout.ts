/** Сохранённая раскладка диаграммы (localStorage по продукту и якорному узлу). */
export type DiagramLayoutPersist = {
  /** Левый верхний угол карточки в мировых координатах canvas. */
  nodePositions: Record<string, { x: number; y: number }>;
  /** Смещения мини-карточек внутри группы: ключ `clusterId::memberId`. */
  clusterMemberOffsets: Record<string, { dx: number; dy: number }>;
};

export function clusterMemberOffsetKey(clusterId: string, memberId: string): string {
  return `${clusterId}::${memberId}`;
}
