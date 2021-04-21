const { expect } = require("chai");

describe("AlgobotsToken", () => {
  let AlgobotsToken;
  before(async () => {
    AlgobotsToken = await ethers.getContractFactory("AlgobotsToken");
  });

  it("should be an ERC-20 token", async () => {
    const token = await AlgobotsToken.deploy();
    await token.deployed();

    const erc20InterfaceId = "0x36372b07";
    expect(await token.supportsInterface(erc20InterfaceId)).to.be.true;
  });

  describe("cumulativeTokens", () => {
    it("decays exponentially with 4-year half-life", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      expect(await token.cumulativeTokens(0)).to.equal(0);
      expect(await token.cumulativeTokens(86400 * 365 * 4)).to.equal(499999);
      expect(await token.cumulativeTokens(86400 * 365 * 8)).to.equal(749999);
      expect(await token.cumulativeTokens(86400 * 365 * 12)).to.equal(874999);
      expect(await token.cumulativeTokens(86400 * 365 * 16)).to.equal(937499);
      expect(await token.cumulativeTokens(86400 * 365 * 64)).to.equal(999984);
      expect(await token.cumulativeTokens(86400 * 365 * 128)).to.equal(1000000);
    });
  });
});
