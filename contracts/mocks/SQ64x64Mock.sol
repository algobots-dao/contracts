// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../libraries/SQ64x64.sol";

contract SQ64x64Mock {
    // Baseline for gas tests.
    function noop() external pure {}

    function fromInt(int64 _i) external pure returns (int128) {
        return SQ64x64.fromInt(_i);
    }

    function fromParts(int64 _i, uint64 _f) external pure returns (int128) {
        return SQ64x64.fromParts(_i, _f);
    }

    function intPart(int128 _z) external pure returns (int64) {
        return SQ64x64.intPart(_z);
    }

    function fracPart(int128 _z) external pure returns (uint64) {
        return SQ64x64.fracPart(_z);
    }

    function addFixed(int128 _z1, int128 _z2) external pure returns (int128) {
        return SQ64x64.addFixed(_z1, _z2);
    }

    function subFixed(int128 _z1, int128 _z2) external pure returns (int128) {
        return SQ64x64.subFixed(_z1, _z2);
    }

    function mulFixed(int128 _z1, int128 _z2) external pure returns (int128) {
        return SQ64x64.mulFixed(_z1, _z2);
    }

    function divFixed(int128 _z1, int128 _z2) external pure returns (int128) {
        return SQ64x64.divFixed(_z1, _z2);
    }

    function neg(int128 _z) external pure returns (int128) {
        return SQ64x64.neg(_z);
    }

    function addInt(int128 _z1, int64 _i2) external pure returns (int128) {
        return SQ64x64.addInt(_z1, _i2);
    }

    function subInt(int128 _z1, int64 _i2) external pure returns (int128) {
        return SQ64x64.subInt(_z1, _i2);
    }

    function mulInt(int128 _z1, int64 _i2) external pure returns (int128) {
        return SQ64x64.mulInt(_z1, _i2);
    }

    function divInt(int128 _z1, int64 _i2) external pure returns (int128) {
        return SQ64x64.divInt(_z1, _i2);
    }

    function log2(int128 _z) external pure returns (int128 _log2Z) {
        return SQ64x64.log2(_z);
    }

    function log2Approx(int128 _z, uint256 _precision)
        external
        pure
        returns (int128 _log2Z)
    {
        return SQ64x64.log2Approx(_z, _precision);
    }
}
