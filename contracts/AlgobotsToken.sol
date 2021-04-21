// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract AlgobotsToken is ERC20, ERC165 {
    constructor() ERC20("Algobots", "BOTS") {}

    /// Returns `1e18 * (1 - 1/2^(secondsSinceStart / SECONDS_PER_YEAR))`.
    function exponentialDecay(uint256 secondsSinceStart)
        public
        pure
        returns (uint256)
    {
        /// TODO:
        ///   - let `k = ln(0.5) * SECONDS_PER_YEAR` in Q-number fixed point
        ///   - rewrite as `1e18 * (1 - exp(z))` for `z = k * secondsSinceStart`
        ///   - Taylor-expand to `-1e18 * (z + z^2 / 2! + z^3 / 3! + ...)`
        ///   - offline, compute convergence properties, bound series,
        ///     and replace tail (after 10 years) with a monotonic bounded fn
        revert("Not yet implemented");
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
