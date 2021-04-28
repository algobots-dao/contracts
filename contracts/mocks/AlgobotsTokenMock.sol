// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../AlgobotsToken.sol";

contract AlgobotsTokenMock {
    AlgobotsToken algobots;

    constructor(AlgobotsToken _algobots) {
        algobots = _algobots;
    }

    function claimBotTokensTwice(address destination, uint256 botId)
        public
        returns (uint256)
    {
        uint256 result0 = algobots.claimBotTokens(destination, botId);
        uint256 balance1 = algobots.balanceOf(msg.sender);
        uint256 result1 = algobots.claimBotTokens(destination, botId);
        require(
            result1 == 0,
            "AlgobotsTokenMock: non-zero result from second claimBotTokens call in single transaction"
        );
        uint256 balance2 = algobots.balanceOf(msg.sender);
        require(
            balance1 == balance2,
            "AlgobotsTokenMock: balance changed between claimBotTokens calls in the same transaction"
        );
        return result0;
    }

    function computeAllBatchesVestedInverse()
        public
        view
        returns (uint32[1001] memory reltimes)
    {
        for (uint256 i = 0; i <= 1000; i++) {
            reltimes[i] = algobots.batchesVestedInverse(i);
        }
    }
}
