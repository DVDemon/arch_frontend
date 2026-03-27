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
