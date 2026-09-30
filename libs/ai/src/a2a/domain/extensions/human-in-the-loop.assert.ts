import type {
  ActionRequest,
  Decision,
  HITLRequest,
  HITLResponse,
  InterruptOnConfig,
  ReviewConfig,
} from 'langchain';

import type {
  HitlActionRequest,
  HitlDecision,
  HitlRequestPayload,
  HitlResponsePayload,
  HitlReviewConfig,
  HitlReviewPolicy,
} from './human-in-the-loop.extension';

type Assert<_T extends true> = never;
type Extends<A, B> = A extends B ? true : false;

export type ActionRequestIsWireCompatible = Assert<
  Extends<ActionRequest, HitlActionRequest>
>;
export type ReviewConfigIsWireCompatible = Assert<
  Extends<ReviewConfig, HitlReviewConfig>
>;
export type WireDecisionIsResumable = Assert<Extends<HitlDecision, Decision>>;
export type ReviewPolicyIsAnInterruptOnEntry = Assert<
  Extends<HitlReviewPolicy, InterruptOnConfig>
>;
export type RequestPayloadCarriesTheInterrupt = Assert<
  Extends<
    Pick<HitlRequestPayload, 'actionRequests' | 'reviewConfigs'>,
    HITLRequest
  >
>;
export type ResponsePayloadResumesTheInterrupt = Assert<
  Extends<Pick<HitlResponsePayload, 'decisions'>, HITLResponse>
>;
