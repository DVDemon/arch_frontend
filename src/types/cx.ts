export interface CjItem {
  id: number;
  name?: string;
  user_portrait?: string;
  userPortrait?: string;
  draft?: boolean;
  bDraft?: boolean;
  id_product?: number;
  idProductExt?: number;
  authorId?: number;
  id_user_profile?: number;
  productId?: number;
  uniqueIdent?: string;
  bpmn?: boolean;
  createdDate?: string;
  lastModifiedDate?: string;
  tags?: string[];
}

export interface CjUpsertPayload {
  name: string;
  user_portrait?: string;
  draft?: boolean;
  tags?: string[];
}

export interface BiItem {
  id: number;
  uniqueIdent?: string;
  name?: string;
  descr?: string;
  isCommunal?: boolean;
  isTarget?: boolean;
  productId?: number;
  id_product?: number;
  idProductExt?: number;
  touchPoints?: string;
  eaGuid?: string;
  ownerRole?: string;
  metrics?: string;
  authorId?: number;
  status?: {
    id?: number;
    name?: string;
  };
  clientScenario?: string;
  ucsReaction?: string;
  participants?: unknown[];
  channel?: unknown[];
  flowLink?: unknown[];
  document?: unknown[];
  mockupLink?: unknown[];
  biSteps?: unknown[];
  isDraft?: boolean;
  draft?: boolean;
  createdDate?: string;
  lastModifiedDate?: string;
}

export interface BiUpsertPayload {
  name: string;
  descr?: string;
  productId?: number;
  draft?: boolean;
  communal?: boolean;
  target?: boolean;
  touchPoints?: string;
  eaGuid?: string;
  ownerRole?: string;
  metrics?: string;
  clientScenario?: string;
  ucsReaction?: string;
}

/** Ответ GET /api/cx/v2/product/cj/{id} (CJFullDtoV3). */
export interface CjAuthor {
  id?: number;
  fullName?: string;
  email?: string;
}

/** Связь шага BI (RelationDto в CX). */
export interface BiRelationDto {
  id?: number;
  userId?: number;
  description?: string;
  tcId?: number;
  tcName?: string;
  tcCode?: string;
  productId?: number;
  productName?: string;
  productAlias?: string;
  interfaceId?: number;
  interfaceName?: string;
  interfaceCode?: string;
  operationId?: number;
  operation?: string;
  order?: number;
}

/** Шаг сценария BI (BiStepDtoV3). */
export interface BiScenarioStep {
  id?: number;
  name?: string;
  latency?: number;
  uniqueIdent?: string;
  type?: string;
  errorRate?: number;
  rps?: number;
  relations?: BiRelationDto[];
}

export interface BiLinkItem {
  descr?: string;
  url?: string;
}

export interface BiDetailV3 {
  id?: number;
  uniqueIdent?: string;
  name?: string;
  descr?: string;
  isCommunal?: boolean;
  isTarget?: boolean;
  isDraft?: boolean;
  touchPoints?: string;
  eaGuid?: string;
  productId?: number;
  ownerRole?: string;
  metrics?: string;
  authorId?: number;
  createdDate?: string;
  lastModifiedDate?: string;
  status?: { id?: number; name?: string };
  clientScenario?: string;
  ucsReaction?: string;
  participants?: unknown[];
  channel?: unknown[];
  flowLink?: BiLinkItem[] | unknown[];
  document?: BiLinkItem[] | unknown[];
  mockupLink?: BiLinkItem[] | unknown[];
  feelings?: { id?: number; name?: string };
  biSteps?: BiScenarioStep[] | unknown[];
}

export interface CjStepDetail {
  id?: number;
  cjId?: number;
  order?: number;
  name?: string;
  description?: string;
  bi?: BiDetailV3[];
}

export interface CjFullDetail {
  id: number;
  name?: string;
  draft?: boolean;
  productId?: number;
  userPortrait?: string;
  uniqueIdent?: string;
  bpmn?: boolean;
  tags?: string[];
  createdDate?: string;
  lastModifiedDate?: string;
  author?: CjAuthor;
  steps?: CjStepDetail[];
}
