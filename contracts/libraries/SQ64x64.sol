// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

/// Signed fixed-point number format with 64 integral bits and 64
/// fractional bits.
///
/// Binary operations are provided for `(SQ64x64, SQ64x64)` operands and
/// `(SQ64x64, int64)` operands. Comparisons between two fixed-point numbers
/// (*not* fixed-point with integers) may be performed with the relevant
/// built-in operators.
///
/// See: https://en.wikipedia.org/wiki/Q_(number_format)
library SQ64x64 {
    using SQ64x64 for int128;

    int128 internal constant ZERO = 0;
    int128 internal constant ONE = 2**64;
    int128 internal constant TWO = 2 * ONE;
    int128 internal constant HALF = ONE / 2;

    function fromInt(int64 _i) internal pure returns (int128) {
        return int128(_i) * ONE;
    }

    function fromParts(int64 _i, uint64 _f) internal pure returns (int128) {
        return int128(_i) * ONE + int128(uint128(_f));
    }

    function intPart(int128 _z) internal pure returns (int64) {
        return int64(_z >> 64);
    }

    function fracPart(int128 _z) internal pure returns (uint64) {
        return uint64(uint128(_z));
    }

    function addFixed(int128 _z1, int128 _z2) internal pure returns (int128) {
        return _z1 + _z2;
    }

    function subFixed(int128 _z1, int128 _z2) internal pure returns (int128) {
        return _z1 - _z2;
    }

    function mulFixed(int128 _z1, int128 _z2) internal pure returns (int128) {
        int256 bigResult = (int256(_z1) * int256(_z2)) / int256(ONE);
        int128 result = int128(bigResult);
        require(int256(result) == bigResult, "SQ64x64: mul overflow");
        return result;
    }

    function divFixed(int128 _z1, int128 _z2) internal pure returns (int128) {
        int256 bigResult = (int256(_z1) * int256(ONE)) / int256(_z2);
        int128 result = int128(bigResult);
        require(int256(result) == bigResult, "SQ64x64: div overflow");
        return result;
    }

    function neg(int128 _z) internal pure returns (int128) {
        return -_z;
    }

    function addInt(int128 _z1, int64 _i2) internal pure returns (int128) {
        return _z1 + int128(_i2) * ONE;
    }

    function subInt(int128 _z1, int64 _i2) internal pure returns (int128) {
        return _z1 - int128(_i2) * ONE;
    }

    function mulInt(int128 _z1, int64 _i2) internal pure returns (int128) {
        return _z1 * _i2;
    }

    function divInt(int128 _z1, int64 _i2) internal pure returns (int128) {
        return _z1 / _i2;
    }

    /// Computes the base-2 logarithm of the input, exactly precise in the full
    /// 64 fractional bits.
    function log2(int128 _z) internal pure returns (int128 _log2Z) {
        return log2Approx(_z, 64);
    }

    /// Computes the base-2 logarithm of the input, up to `_precision`
    /// fractional bits. Increasing `_precision` past `64` will consume more
    /// gas but not change the result.
    function log2Approx(int128 _z, uint256 _precision)
        internal
        pure
        returns (int128 _log2Z)
    {
        require(_z > 0, "SQ64x64: log2 domain error");
        // "A Fast Binary Logarithm Algorithm" (Clay S. Turner; al Kashi).

        // `x` is the input SQ64x64, but unsigned (checked to be positive
        // above) and extended to 256 bits to remove intermediate bit-twiddling
        // in the squaring step.
        uint256 x = uint256(int256(_z));
        int128 y = 0;
        while (x < (1 << 64)) {
            x <<= 1;
            y--;
        }
        while (x >= (1 << 65)) {
            x >>= 1;
            y++;
        }
        y <<= 64;

        int128 mantissaBit = HALF;
        for (; _precision > 0; _precision--) {
            // This is `x = x.mulFixed(x)` without the check that the
            // intermediate product fits into an `int128`, which we don't need
            // because we know that `1.0 <= x < 2.0`. This optimization saves
            // about 200 gas per bit on those checks, plus about 550 more
            // because we skip the widening and narrowing conversions.
            x = (x * x) >> 64;
            if (x >= (1 << 65)) {
                x >>= 1;
                y |= mantissaBit;
            }
            mantissaBit >>= 1;
        }
        return y;
    }
}
