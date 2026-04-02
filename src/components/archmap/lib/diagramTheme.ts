/**
 * Цвета для canvas/SVG диаграммы (не наследуются от CSS — задаём явно под светлую и тёмную тему).
 */
export interface DiagramPalette {
  canvasBg: string;
  edgeHalo: string;
  edgeStroke: string;
  cardFill: string;
  cardBorder: string;
  clusterOuterBorder: string;
  clusterInnerFill: string;
  clusterInnerBorder: string;
  clusterTitleMuted: string;
  tagStrip: string;
  textPrimary: string;
  textSecondary: string;
  edgeLabelBg: string;
  edgeLabelBorder: string;
  edgeLabelText: string;
  /** Обводка под текстом подписи ребра (как на canvas — контраст к фону). */
  edgeLabelTextHalo: string;
  badgeFill: string;
  badgeStroke: string;
  badgeIcon: string;
  badgeText: string;
}

export function getDiagramPalette(isDark: boolean): DiagramPalette {
  if (isDark) {
    return {
      canvasBg: '#09090b',
      edgeHalo: '#18181b',
      edgeStroke: '#a1a1aa',
      cardFill: '#18181b',
      cardBorder: '#3f3f46',
      clusterOuterBorder: '#71717a',
      clusterInnerFill: '#27272a',
      clusterInnerBorder: '#52525b',
      clusterTitleMuted: '#a1a1aa',
      tagStrip: '#f59e0b',
      textPrimary: '#fafafa',
      textSecondary: '#a1a1aa',
      edgeLabelBg: 'rgba(24, 24, 27, 0.96)',
      edgeLabelBorder: 'rgba(82, 82, 91, 0.95)',
      edgeLabelText: '#e4e4e7',
      edgeLabelTextHalo: '#09090b',
      badgeFill: '#422006',
      badgeStroke: '#ea580c',
      badgeIcon: '#fb923c',
      badgeText: '#ffedd5',
    };
  }
  return {
    canvasBg: '#FAFAFA',
    edgeHalo: '#FFFFFF',
    edgeStroke: '#BBBBBB',
    cardFill: '#FFFFFF',
    cardBorder: '#E0E0E0',
    clusterOuterBorder: '#9E9E9E',
    clusterInnerFill: '#FDFDFD',
    clusterInnerBorder: '#D0D0D0',
    clusterTitleMuted: '#666666',
    tagStrip: '#FFB74D',
    textPrimary: '#000000',
    textSecondary: '#888888',
    edgeLabelBg: 'rgba(250, 250, 250, 0.95)',
    edgeLabelBorder: 'rgba(180, 180, 180, 0.95)',
    edgeLabelText: '#444444',
    edgeLabelTextHalo: '#FAFAFA',
    badgeFill: '#FFF3E0',
    badgeStroke: '#E65100',
    badgeIcon: '#E65100',
    badgeText: '#BF360C',
  };
}
