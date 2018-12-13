import { ContractArtifact } from 'ethereum-types';

import * as DutchAuction from '../../generated-artifacts/DutchAuction.json';
import * as Forwarder from '../../generated-artifacts/Forwarder.json';
import * as OrderMatcher from '../../generated-artifacts/OrderMatcher.json';

export const artifacts = {
    DutchAuction: DutchAuction as ContractArtifact,
    Forwarder: Forwarder as ContractArtifact,
    OrderMatcher: OrderMatcher as ContractArtifact,
};
