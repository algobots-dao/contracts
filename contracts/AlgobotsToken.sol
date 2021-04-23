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

    address owner;

    address artist;

    // Unix timestamp at which vesting begins, or 0 if not yet initialized.
    uint256 startTime;
    uint256 constant _TOTAL_BATCHES = 1000;
    // Invariant: before `startTime` is initialized, `fullyVestedBatches == 0`.
    // Invariant: if `fullyVestedBatches > 0` and `block.timestamp > startTime`,
    // then `fullyVestedBatches <= _TOTAL_BATCHES` and
    // `batchesVestedInverse(fullyVestedBatches) + startTime <= block.timestamp`.
    uint256 fullyVestedBatches;
    // Invariant: once initialized,
    // `lastWaypoint == batchesVestedInverse(fullyVestedBatches)`.
    uint32 lastWaypoint;
    // Invariant: once initialized: if `fullyVestedBatches < _TOTAL_BATCHES`,
    // then `nextWaypoint == batchesVestedInverse(fullyVestedBatches + 1)`.
    // Otherwise, `nextWaypoint == type(uint32).max`.
    uint32 nextWaypoint;

    uint256 constant _CLAIMANT_ARTIST = 500;
    uint256 constant _CLAIMANT_TREASURY = 501;
    uint256 constant _CLAIMANT_COMMUNITY = 502;

    // How many attobatches each actor has claimed. Keys from 0 to 499
    // inclusive are Algobot IDs, and higher keys are `_CLAIMANT_ARTIST`,
    // `_CLAIMANT_TREASURY`, or `_CLAIMANT_COMMUNITY`.
    uint256[503] attobatchesClaimed;

    modifier onlyOwner {
        require(msg.sender == owner, "AlgobotsToken: unauthorized for owner");
        _;
    }

    modifier onlyArtist {
        require(msg.sender == artist, "AlgobotsToken: unauthorized for artist");
        _;
    }

    modifier onlyInitialized {
        require(startTime != 0, "AlgobotsToken: uninitialized");
        _;
    }

    constructor() ERC20("Algobots", "BOTS") {
        owner = msg.sender;
    }

    function setArtist(address newArtist) public onlyOwner {
        artist = newArtist;
    }

    function transferArtist(address newArtist) public onlyArtist {
        artist = newArtist;
    }

    function claimArtistTokens(address destination)
        public
        onlyArtist
        returns (uint256)
    {
        return _claimTokens(_CLAIMANT_ARTIST, destination);
    }

    /// Claim all new tokens on behalf of `claimantId` (an index into
    /// `attobatchesClaimed`) and transfer them to `destination`. Caller
    /// is responsible for verifying authorization.
    ///
    /// Returns number of tokens minted.
    function _claimTokens(uint256 claimantId, address destination)
        internal
        returns (uint256)
    {
        (uint256 fullBatches, uint256 remainingAttobatches) =
            cacheCumulativeBatches();
        uint256 totalAttobatches = 10**18 * fullBatches + remainingAttobatches;
        uint256 existingAttobatches = attobatchesClaimed[claimantId];
        attobatchesClaimed[claimantId] = totalAttobatches;
        uint256 newAttobatches = totalAttobatches - existingAttobatches;

        uint256 multiplier;
        if (claimantId == _CLAIMANT_ARTIST) {
            multiplier = 100;
        } else if (
            claimantId == _CLAIMANT_TREASURY ||
            claimantId == _CLAIMANT_COMMUNITY
        ) {
            multiplier = 200;
        } else {
            multiplier = 1;
        }
        uint256 newTokens = newAttobatches * multiplier;

        _mint(destination, newTokens);
        return newTokens;
    }

    function setVestingSchedule(uint256 _startTime) public onlyOwner {
        require(startTime == 0, "AlgobotsToken: schedule already initialized");
        require(_startTime != 0, "AlgobotsToken: must set start time");
        startTime = _startTime;
        lastWaypoint = batchesVestedInverse(fullyVestedBatches);
        nextWaypoint = batchesVestedInverse(fullyVestedBatches + 1);
    }

    function cumulativeBatches()
        public
        view
        onlyInitialized
        returns (uint256 fullBatches, uint256 attobatches)
    {
        fullBatches = fullyVestedBatches;
        if (fullBatches >= _TOTAL_BATCHES) return (fullBatches, 0);

        if (block.timestamp < startTime) return (0, 0);
        uint256 elapsed = block.timestamp - startTime;

        uint256 lo = uint256(lastWaypoint);
        uint256 hi = uint256(nextWaypoint);
        while (hi <= elapsed) {
            fullBatches++;
            if (fullBatches >= _TOTAL_BATCHES) return (fullBatches, 0);
            lo = hi;
            hi = uint256(batchesVestedInverse(fullBatches + 1));
        }

        attobatches = (10**18 * (elapsed - lo)) / (hi - lo);
        return (fullBatches, attobatches);
    }

    function cacheCumulativeBatches()
        public
        returns (uint256 fullBatches, uint256 attobatches)
    {
        (fullBatches, attobatches) = cumulativeBatches();
        if (fullyVestedBatches != fullBatches) {
            setFullyVestedBatches(fullBatches);
        }
        return (fullBatches, attobatches);
    }

    /// Low-level method for updating the cache parameters. Must be
    /// called with a `fullBatches` value such that the current block
    /// timestamp lies between `batchesVestedInverse(fullBatches)` and
    /// `batchesVestedInverse(fullBatches + 1)` (with upper bound check omitted
    /// if `fullBatches == _TOTAL_BATCHES`).
    ///
    /// The purpose of this method is to advance the cache over a long period
    /// of time with random access instead of having to linearly search over the
    /// whole domain. This is useful for tests, or if the contract is deployed
    /// with a start time far in the past.
    function setFullyVestedBatches(uint256 fullBatches) public {
        uint32 lo = batchesVestedInverse(fullBatches);
        uint32 hi =
            fullBatches < _TOTAL_BATCHES
                ? batchesVestedInverse(fullBatches + 1)
                : type(uint32).max;
        uint256 blockTimestamp = block.timestamp;
        uint256 elapsed =
            blockTimestamp >= startTime ? blockTimestamp - startTime : 0;
        require(
            lo <= elapsed && elapsed < hi,
            "setFullyVestedBatches: wrong fullBatches"
        );
        fullyVestedBatches = fullBatches;
        lastWaypoint = lo;
        nextWaypoint = hi;
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
        int128 z = _EXP_SCALE_FACTOR.mulInt(int64(secondsSinceStart));
        int128 expZ = SQ64x64.ONE;

        // Choose a term count such that the decay computation is
        // accurate to within 1e-3 tokens. It suffices to just pick 82
        // in all cases, but when `z` is small, we can save a lot of gas
        // by computing fewer terms, since convergence is faster.
        int64 maxTerm;
        if (secondsSinceStart < 86400 * 833) {
            maxTerm = 8;
        } else if (secondsSinceStart < 86400 * 6753) {
            maxTerm = 16;
        } else if (secondsSinceStart < 86400 * 18535) {
            maxTerm = 32;
        } else if (secondsSinceStart < 86400 * 43134) {
            maxTerm = 64;
        } else {
            maxTerm = 82;
        }

        for (int64 i = maxTerm; i > 0; i--) {
            expZ = (z.divInt(i)).mulFixed(expZ).addFixed(SQ64x64.ONE);
        }
        int64 result =
            (SQ64x64.ONE.subFixed(expZ)).mulInt(int64(_MAX_TOKENS)).intPart();
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

    function log2(int128 _zSq64x64) public pure returns (int128 _log2ZSq64x64) {
        require(_zSq64x64 > 0, "log2: math domain error");
        // "A Fast Binary Logarithm Algorithm" (Clay S. Turner; al Kashi).
        int128 x = _zSq64x64;
        int128 y = SQ64x64.ZERO;
        while (x < SQ64x64.ONE) {
            x = x.mulInt(2);
            y = y.subFixed(SQ64x64.ONE);
        }
        while (x >= SQ64x64.TWO) {
            x = x.divInt(2);
            y = y.addFixed(SQ64x64.ONE);
        }

        int128 mantissaBit = SQ64x64.HALF;
        for (uint256 i = 0; i < 64; i++) {
            x = x.mulFixed(x);
            if (x >= SQ64x64.TWO) {
                x = x.divInt(2);
                y = y.addFixed(mantissaBit);
            }
            mantissaBit = mantissaBit.divInt(2);
        }
        return y;
    }

    /// Computes the number of seconds after the start time at which the given
    /// number of batches have fully vested. For example, after a total of
    /// `batchesVestedInverse(5)` seconds after start, exactly 5 batches have
    /// fully vested. After a total of `batchesVestedInverse(_TOTAL_BATCHES)`
    /// seconds, all batches have vested.
    ///
    /// Requires `0 <= _batches <= _TOTAL_BATCHES`.
    function batchesVestedInverse(uint256 _batches)
        public
        pure
        returns (uint32 reltime)
    {
        require(_batches <= 1000, "batchesVestedInverse: domain error");
        uint32 batches32 = uint32(_batches);
        if (
            batches32 > 968 /* 1000 * (1 - 2^(-5)) */
        ) {
            uint32 base = batchesVestedInverse(968);
            // 5687104 = d(batchesVestedInverse(t))/dt at t = 968
            uint32 linearTerm = 5687104 * (batches32 - 968);
            return base + linearTerm;
        }
        int128 fraction =
            SQ64x64.fromInt(int64(uint64(batches32))).divInt(1000);
        int128 halfLives = log2(SQ64x64.ONE.subFixed(fraction)).neg();
        int128 exact = halfLives.mulInt(86400 * 365 * 4);
        return uint32(uint64(exact.intPart()));
    }
}
