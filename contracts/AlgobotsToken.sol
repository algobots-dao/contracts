// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./libraries/SQ64x64.sol";

contract AlgobotsToken is ERC20, ERC165 {
    using SQ64x64 for int128;

    uint64 constant _MAX_TOKENS = 1_000_000;
    // floor(log(1.0 / _MAX_TOKENS) / log(0.5 ** 0.25) * 86400 * 365)
    uint64 constant _ALL_TOKENS_MINTED_AFTER_SECONDS = 2514247785;
    // ln((0.5 ** 0.25) / (86400 * 365)) as a SQ64x64
    int128 constant _EXP_SCALE_FACTOR =
        int128(uint128(0xffffffffffffffffffffffe8664e7800));
    // minimum value such that decay computation is correct to
    // within 1 ulp over entire domain (with ulp = 1.0 / _MAX_TOKENS)
    int64 constant _MAX_TERM = 47;

    address owner;

    // Unix timestamp at which vesting begins, or 0 if not yet initialized.
    uint256 startTime;
    // Timestamps at which each batch finishes vesting, represented as
    // seconds since `startTime`. Once initialized, must be non-empty
    // and strictly increasing.
    uint32[] batchVestingReltimes;
    // Invariant: if `fullyVestedBatches > 0`, then
    // `fullyVestedBatches <= batchVestingReltimes.length` and
    // `batchVestingReltimes[fullyVestedBatches - 1] + startTime <= block.timestamp`.
    uint256 fullyVestedBatches = 0;

    modifier onlyOwner {
        require(msg.sender == owner, "AlgobotsToken: unauthorized");
        _;
    }

    modifier onlyInitialized {
        require(startTime != 0, "AlgobotsToken: uninitialized");
        _;
    }

    constructor() ERC20("Algobots", "BOTS") {
        owner = msg.sender;
    }

    function setVestingSchedule(
        uint256 _startTime,
        uint32[] memory _batchVestingReltimes
    ) public onlyOwner {
        require(startTime == 0, "AlgobotsToken: schedule already initialized");
        require(_startTime != 0, "AlgobotsToken: must set start time");
        require(
            _batchVestingReltimes.length > 0,
            "AlgobotsToken: must include at least one batch"
        );

        for (uint256 i = 0; i + 1 < _batchVestingReltimes.length; i++) {
            require(
                _batchVestingReltimes[i] < _batchVestingReltimes[i + 1],
                "AlgobotsToken: schedule must be strictly increasing"
            );
        }

        startTime = _startTime;
        batchVestingReltimes = _batchVestingReltimes;
    }

    function cumulativeBatches()
        public
        view
        onlyInitialized
        returns (uint256 fullBatches, uint256 attobatches)
    {
        fullBatches = fullyVestedBatches;
        uint256 reltimesLength = batchVestingReltimes.length;
        if (fullBatches >= reltimesLength) return (fullBatches, 0);

        if (block.timestamp < startTime) return (0, 0);
        uint256 elapsed = block.timestamp - startTime;

        uint256 lo =
            fullBatches > 0 ? batchVestingReltimes[fullBatches - 1] : 0;
        uint256 hi = uint256(batchVestingReltimes[fullBatches]);
        while (hi <= elapsed) {
            fullBatches++;
            if (fullBatches >= reltimesLength) return (fullBatches, 0);
            lo = hi;
            hi = uint256(batchVestingReltimes[fullBatches]);
        }

        attobatches = (10**18 * (elapsed - lo)) / (hi - lo);
        return (fullBatches, attobatches);
    }

    function cacheCumulativeBatches()
        public
        returns (uint256 fullBatches, uint256 attobatches)
    {
        (fullBatches, attobatches) = cumulativeBatches();
        fullyVestedBatches = fullBatches;
        return (fullBatches, attobatches);
    }

    /// Returns `1e6 * (1 - 1/2^(secondsSinceStart / (SECONDS_PER_YEAR * 4)))`.
    function cumulativeTokens(uint64 secondsSinceStart)
        public
        pure
        returns (uint256)
    {
        if (secondsSinceStart > _ALL_TOKENS_MINTED_AFTER_SECONDS) {
            return _MAX_TOKENS;
        }
        int128 z =
            SQ64x64.fromInt(int64(secondsSinceStart)).fixedMul(
                _EXP_SCALE_FACTOR
            );
        int128 expZ = SQ64x64.fromInt(1);
        for (int64 i = _MAX_TERM; i > 0; i--) {
            expZ = (z.fixedDiv(SQ64x64.fromInt(i))).fixedMul(expZ).fixedAdd(
                SQ64x64.ONE
            );
        }
        int64 result =
            (SQ64x64.ONE.fixedSub(expZ))
                .fixedMul(SQ64x64.fromInt(int64(_MAX_TOKENS)))
                .intPart();
        return uint256(uint64(result));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return
            interfaceId == type(IERC20).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
