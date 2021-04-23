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

  describe("claimArtistTokens", () => {
    it("sends tokens correctly", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      const [admin, artist, mule] = await ethers.getSigners();
      await token.connect(admin).setArtist(artist.address);

      expect(await token.balanceOf(artist.address)).to.equal(0);

      const t0 = await now();
      const startTime = t0 + 10;
      const reltimes = [20, 30, 40, 50];
      await token.setVestingSchedule(startTime, reltimes);

      expect(await now()).to.be.lessThan(startTime);
      await token.connect(artist).claimArtistTokens(artist.address);
      expect(await token.balanceOf(artist.address)).to.equal(0);

      const PER_BATCH = 10n ** 18n * 100n;

      await setNext(startTime + 10);
      expect(await token.balanceOf(artist.address)).to.equal(0);
      await token.connect(artist).claimArtistTokens(artist.address);
      expect(await token.balanceOf(artist.address)).to.equal(PER_BATCH / 2n);

      await setNext(startTime + 15);
      await token.connect(artist).claimArtistTokens(artist.address);
      expect(await token.balanceOf(artist.address)).to.equal(
        (PER_BATCH / 4n) * 3n
      );

      await token.connect(artist).transfer(mule.address, PER_BATCH / 2n);
      expect(await token.balanceOf(artist.address)).to.equal(PER_BATCH / 4n);
      expect(await token.balanceOf(mule.address)).to.equal(PER_BATCH / 2n);

      await setNext(startTime + 30);
      await token.connect(artist).claimArtistTokens(mule.address);
      expect(await token.balanceOf(artist.address)).to.equal(PER_BATCH / 4n);
      expect(await token.balanceOf(mule.address)).to.equal(
        (PER_BATCH / 4n) * 7n
      );

      await setNow(startTime + 999);
      await token.connect(artist).claimArtistTokens(mule.address);
      const ALL = PER_BATCH * 4n - PER_BATCH / 4n;
      expect(await token.balanceOf(mule.address)).to.equal(ALL);
      await setNow(startTime + 9999);
      await token.connect(artist).claimArtistTokens(mule.address);
      expect(await token.balanceOf(mule.address)).to.equal(ALL);
    });
  });

  describe("log2", () => {
    function toSq64x64(z) {
      const intPart = BigInt(Math.floor(z)) * 2n ** 64n;
      const fracPart = BigInt((z - Math.floor(z)) * 2 ** 64);
      return ethers.BigNumber.from(intPart + fracPart);
    }
    function fromSq64x64(z) {
      const bignum = ethers.BigNumber.from(z).fromTwos(128);
      if (bignum.toBigInt() >> 64n > 2n ** 53n) {
        // (shouldn't happen for `log2` output, which is bounded above by 64)
        throw new Error("SQ64x64 out of JavaScript float range: " + z);
      }
      const intPart = Number(bignum.toBigInt() >> 64n);
      const fracPart = Number(bignum.toTwos(128).mask(64).toBigInt()) / 2 ** 64;
      return intPart + fracPart;
    }
    it("reverts on zero and negative numbers", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();
      for (const zSq64x64 of [0, -1, toSq64x64(-1), toSq64x64(-7.5)]) {
        await expect(token.log2(zSq64x64)).to.be.revertedWith(
          "log2: math domain error"
        );
      }
    });
    it("computes correctly", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      expect(fromSq64x64(await token.log2(toSq64x64(1)))).to.equal(0);
      expect(fromSq64x64(await token.log2(toSq64x64(2)))).to.equal(1);
      expect(fromSq64x64(await token.log2(toSq64x64(4)))).to.equal(2);
      expect(fromSq64x64(await token.log2(toSq64x64(0.5)))).to.equal(-1);
      expect(fromSq64x64(await token.log2(toSq64x64(0.25)))).to.equal(-2);

      expect(fromSq64x64(await token.log2(toSq64x64(3)))).to.equal(
        Math.log2(3)
      );
      expect(fromSq64x64(await token.log2(toSq64x64(Math.PI)))).to.equal(
        Math.log2(Math.PI)
      );

      expect(fromSq64x64(await token.log2(toSq64x64(0.1)))).to.equal(
        Math.log2(0.1)
      );

      // very small fixed-point numbers (note: no `toSq64x64`)
      expect(fromSq64x64(await token.log2(1))).to.equal(-64);
      expect(fromSq64x64(await token.log2(2))).to.equal(-63);
      expect(fromSq64x64(await token.log2(3))).to.equal(-64 + Math.log2(3));
      expect(fromSq64x64(await token.log2(4))).to.equal(-62);
      expect(fromSq64x64(await token.log2(5))).to.equal(-64 + Math.log2(5));
    });
  });

  describe("batchesVestedInverse", () => {
    let token;
    before(async () => {
      token = await AlgobotsToken.deploy();
      await token.deployed();
    });

    it("computes the exponential portion", async () => {
      expect(await token.batchesVestedInverse(0)).to.equal(0);
      expect(await token.batchesVestedInverse(1)).to.equal(182078);
      expect(await token.batchesVestedInverse(2)).to.equal(364339);
      expect(await token.batchesVestedInverse(50)).to.equal(9334729);
      expect(await token.batchesVestedInverse(100)).to.equal(19174278);
      expect(await token.batchesVestedInverse(500)).to.equal(126144000);
      expect(await token.batchesVestedInverse(968)).to.equal(626403892);
    });
    it("computes the linear portion", async () => {
      const base = 626403892;
      const derivative = 5687104;
      expect(await token.batchesVestedInverse(969)).to.equal(base + derivative);
      expect(await token.batchesVestedInverse(970)).to.equal(
        base + 2 * derivative
      );
      expect(await token.batchesVestedInverse(999)).to.equal(
        base + 31 * derivative
      );
      expect(await token.batchesVestedInverse(1000)).to.equal(
        base + 32 * derivative
      );
    });
    it("reverts for arguments past 1000", async () => {
      await expect(token.batchesVestedInverse(1001)).to.be.revertedWith(
        "batchesVestedInverse: domain error"
      );
      await expect(
        token.batchesVestedInverse(2n ** 32n - 1n)
      ).to.be.revertedWith("batchesVestedInverse: domain error");
      await expect(
        token.batchesVestedInverse(2n ** 256n - 1n)
      ).to.be.revertedWith("batchesVestedInverse: domain error");
    });
  });
});
