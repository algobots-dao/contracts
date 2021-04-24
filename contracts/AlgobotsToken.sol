// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./libraries/SQ64x64.sol";

contract AlgobotsToken is ERC20, ERC165 {
    using SQ64x64 for int128;

    address owner;
    IERC721 artblocks;

    address artist;
    address treasury;
    address community;

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

    function setArtblocks(IERC721 newArtblocks) public onlyOwner {
        artblocks = newArtblocks;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }

    function setCommunity(address newCommunity) public onlyOwner {
        community = newCommunity;
    }

    function transferArtist(address newArtist) public onlyArtist {
        artist = newArtist;
    }

    function claimBotTokens(address destination, uint256 botId)
        public
        returns (uint256)
    {
        uint256[] memory botIds = new uint256[](1);
        botIds[0] = botId;
        return claimBotTokensMany(destination, botIds);
    }

    function claimBotTokensMany(address destination, uint256[] memory botIds)
        public
        returns (uint256)
    {
        require(destination != address(0), "AlgobotsToken: null destination");
        for (uint256 i = 0; i < botIds.length; i++) {
            uint256 botId = botIds[i];
            require(botId < 500, "AlgobotsToken: botId out of range");
            require(
                authorizedForBot(botId),
                "AlgobotsToken: unauthorized for bot"
            );
        }
        return _claimTokensMany(botIds, destination);
    }

    function claimArtistTokens(address destination)
        public
        onlyArtist
        returns (uint256)
    {
        require(destination != address(0), "AlgobotsToken: null destination");
        return _claimTokens(_CLAIMANT_ARTIST, destination);
    }

    function claimTreasuryTokens() public returns (uint256) {
        require(treasury != address(0), "AlgobotsToken: no treasury address");
        return _claimTokens(_CLAIMANT_TREASURY, treasury);
    }

    function claimCommunityTokens() public returns (uint256) {
        require(community != address(0), "AlgobotsToken: no community address");
        return _claimTokens(_CLAIMANT_COMMUNITY, community);
    }

    function authorizedForBot(uint256 botId) internal view returns (bool) {
        uint256 nftId = 40_000_000 + botId;
        address botOwner = artblocks.ownerOf(nftId);
        if (msg.sender == botOwner) return true;
        if (artblocks.isApprovedForAll(botOwner, msg.sender)) return true;
        if (artblocks.getApproved(nftId) == msg.sender) return true;
        return false;
    }

    function _claimTokens(uint256 claimantId, address destination)
        internal
        returns (uint256)
    {
        uint256[] memory claimantIds = new uint256[](1);
        claimantIds[0] = claimantId;
        return _claimTokensMany(claimantIds, destination);
    }

    /// Claim all new tokens on behalf of `claimantIds` (indices into
    /// `attobatchesClaimed`) and transfer them to `destination`. Caller
    /// is responsible for verifying authorization.
    ///
    /// Returns total number of tokens minted.
    function _claimTokensMany(uint256[] memory claimantIds, address destination)
        internal
        returns (uint256)
    {
        (uint256 fullBatches, uint256 remainingAttobatches) =
            cacheCumulativeBatches();
        uint256 totalAttobatches = 10**18 * fullBatches + remainingAttobatches;
        uint256 newTokens = 0;

        for (uint256 i = 0; i < claimantIds.length; i++) {
            uint256 claimantId = claimantIds[i];
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
            newTokens += newAttobatches * multiplier;
        }

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
        int128 halfLives = SQ64x64.ONE.subFixed(fraction).log2Approx(30).neg();
        int128 exact = halfLives.mulInt(86400 * 365 * 4);
        return uint32(uint64(exact.intPart()));
    }
}
