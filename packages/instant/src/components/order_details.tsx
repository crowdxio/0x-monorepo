import { BuyQuoteInfo } from '@0xproject/asset-buyer';
import { BigNumber } from '@0xproject/utils';
import * as _ from 'lodash';
import * as React from 'react';

import { ColorOption } from '../style/theme';
import { format } from '../util/format';

import { Container, Flex, Text } from './ui';

export interface OrderDetailsProps {
    buyQuoteInfo?: BuyQuoteInfo;
    ethUsdPrice?: BigNumber;
}

export class OrderDetails extends React.Component<OrderDetailsProps> {
    public render(): React.ReactNode {
        const { buyQuoteInfo, ethUsdPrice } = this.props;
        const ethAssetPrice = _.get(buyQuoteInfo, 'ethPerAssetPrice');
        const ethTokenFee = _.get(buyQuoteInfo, 'feeEthAmount');
        const totalEthAmount = _.get(buyQuoteInfo, 'totalEthAmount');
        return (
            <Container padding="20px" width="100%">
                <Container marginBottom="10px">
                    <Text
                        letterSpacing="1px"
                        fontColor={ColorOption.primaryColor}
                        fontWeight={600}
                        textTransform="uppercase"
                        fontSize="14px"
                    >
                        Order Details
                    </Text>
                </Container>
                <EthAmountRow
                    rowLabel="Token Price"
                    ethAmount={ethAssetPrice}
                    ethUsdPrice={ethUsdPrice}
                    isEthAmountInBaseUnits={false}
                />
                <EthAmountRow rowLabel="Fee" ethAmount={ethTokenFee} ethUsdPrice={ethUsdPrice} />
                <EthAmountRow
                    rowLabel="Total Cost"
                    ethAmount={totalEthAmount}
                    ethUsdPrice={ethUsdPrice}
                    shouldEmphasize={true}
                />
            </Container>
        );
    }
}

export interface EthAmountRowProps {
    rowLabel: string;
    ethAmount?: BigNumber;
    isEthAmountInBaseUnits?: boolean;
    ethUsdPrice?: BigNumber;
    shouldEmphasize?: boolean;
}

export const EthAmountRow: React.StatelessComponent<EthAmountRowProps> = ({
    rowLabel,
    ethAmount,
    isEthAmountInBaseUnits,
    ethUsdPrice,
    shouldEmphasize,
}) => {
    const fontWeight = shouldEmphasize ? 700 : 400;
    const usdFormatter = isEthAmountInBaseUnits ? format.ethBaseAmountInUsd : format.ethUnitAmountInUsd;
    const ethFormatter = isEthAmountInBaseUnits ? format.ethBaseAmount : format.ethUnitAmount;
    return (
        <Container padding="10px 0px" borderTop="1px dashed" borderColor={ColorOption.feintGrey}>
            <Flex justify="space-between">
                <Text fontWeight={fontWeight} fontColor={ColorOption.grey}>
                    {rowLabel}
                </Text>
                <Container>
                    <Container marginRight="3px" display="inline-block">
                        <Text fontColor={ColorOption.lightGrey}>({usdFormatter(ethAmount, ethUsdPrice)})</Text>
                    </Container>
                    <Text fontWeight={fontWeight} fontColor={ColorOption.grey}>
                        {ethFormatter(ethAmount)}
                    </Text>
                </Container>
            </Flex>
        </Container>
    );
};

EthAmountRow.defaultProps = {
    shouldEmphasize: false,
    isEthAmountInBaseUnits: true,
};

EthAmountRow.displayName = 'EthAmountRow';