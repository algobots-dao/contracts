const { expect } = require("chai");

describe("AlgobotsToken", () => {
  let AlgobotsToken, Clock;
  let clock;
  before(async () => {
    AlgobotsToken = await ethers.getContractFactory("AlgobotsToken");
    Clock = await ethers.getContractFactory("Clock");
    clock = await Clock.deploy();
  });
  async function now() {
    return (await clock.timestamp()).toNumber();
  }
  async function setNext(when) {
    return await network.provider.send("evm_setNextBlockTimestamp", [when]);
  }
  async function setNow(when) {
    await setNext(when);
    await network.provider.send("evm_mine");
  }

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
      expect(await token.cumulativeTokens(86400 * 64)).to.equal(29927);
      expect(await token.cumulativeTokens(86400 * 365 * 1)).to.equal(159103);
      expect(await token.cumulativeTokens(86400 * 832)).to.equal(326319);
      expect(await token.cumulativeTokens(86400 * 833)).to.equal(326639);
      expect(await token.cumulativeTokens(86400 * 365 * 4)).to.equal(499999);
      expect(await token.cumulativeTokens(86400 * 365 * 8)).to.equal(749999);
      expect(await token.cumulativeTokens(86400 * 365 * 12)).to.equal(874999);
      expect(await token.cumulativeTokens(86400 * 365 * 16)).to.equal(937499);
      expect(await token.cumulativeTokens(86400 * 365 * 64)).to.equal(999984);
      expect(await token.cumulativeTokens(86400 * 365 * 128)).to.equal(1000000);
    });
  });

  describe("cumulativeBatches", () => {
    it("performs basic linear interpolation", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      const t0 = await now();
      const startTime = t0 + 10;
      const reltimes = [20, 30, 40, 50];

      async function expectBatchesEqual(full, atto) {
        function bignum(x) {
          return ethers.BigNumber.from(x).toString();
        }
        const actual = (await token.cumulativeBatches()).map(bignum);
        const expected = [full, atto].map(bignum);
        expect(expected).to.deep.equal(actual);
      }

      await token.setVestingSchedule(startTime, reltimes);
      expect(await now()).to.be.lessThan(startTime);
      await expectBatchesEqual(0, 0);

      await setNow(startTime + 1);
      await expectBatchesEqual(0, 10n ** 18n / 20n);

      await setNow(startTime + 19);
      await expectBatchesEqual(0, (10n ** 18n / 20n) * 19n);

      await setNow(startTime + 20);
      await expectBatchesEqual(1, 0);

      await setNow(startTime + 21);
      await expectBatchesEqual(1, 10n ** 18n / 10n);

      await setNext(startTime + 24);
      await token.cacheCumulativeBatches();
      expect(await now()).to.equal(startTime + 24);
      await expectBatchesEqual(1, (10n ** 18n / 10n) * 4n);

      await setNow(startTime + 48);
      await expectBatchesEqual(3, (10n ** 18n / 10n) * 8n);

      await setNext(startTime + 49);
      await token.cacheCumulativeBatches();
      expect(await now()).to.equal(startTime + 49);
      await expectBatchesEqual(3, (10n ** 18n / 10n) * 9n);

      await setNow(startTime + 50);
      await expectBatchesEqual(4, 0);

      await setNow(startTime + 51);
      await expectBatchesEqual(4, 0);

      await token.cacheCumulativeBatches();
      await setNow(startTime + 999);
      await expectBatchesEqual(4, 0);
    });
  });
});
