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
});
