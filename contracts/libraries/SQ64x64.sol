// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

/// Signed fixed-point number format with 64 integral bits and 64
/// fractional bits.
///
/// See: https://en.wikipedia.org/wiki/Q_(number_format)
library SQ64x64 {
    int128 constant ONE = 2**64;

    function fromInt(int64 _i) internal pure returns (int128) {
        return int128(_i) * ONE;
    }

    function intPart(int128 _z) internal pure returns (int64) {
        return int64(_z >> 64);
    }

    function fracPart(int128 _z) internal pure returns (uint64) {
        return uint64(uint128(_z));
    }

    function fixedAdd(int128 _z1, int128 _z2) internal pure returns (int128) {
        return _z1 + _z2;
    }

    function fixedSub(int128 _z1, int128 _z2) internal pure returns (int128) {
        return _z1 - _z2;
    }

    function fixedMul(int128 _z1, int128 _z2) internal pure returns (int128) {
        int256 bigResult = (int256(_z1) * int256(_z2)) / int256(ONE);
        int128 result = int128(bigResult);
        require(int256(result) == bigResult, "SQ64x64: mul overflow");
        return result;
    }

    function fixedDiv(int128 _z1, int128 _z2) internal pure returns (int128) {
        int256 bigResult = (int256(_z1) * int256(ONE)) / int256(_z2);
        int128 result = int128(bigResult);
        require(int256(result) == bigResult, "SQ64x64: div overflow");
        return result;
    }
}
