const { expect } = require("chai");

describe("SQ64x64", () => {
  let SQ64x64Mock;
  let mock;

  const SCALE = 1n << 64n;

  before(async () => {
    SQ64x64Mock = await ethers.getContractFactory("SQ64x64Mock");
    mock = await SQ64x64Mock.deploy();
    await mock.deployed();
  });

  function toSq(int, frac) {
    return (
      ethers.BigNumber.from(int).toBigInt() * SCALE +
      ethers.BigNumber.from(frac).toBigInt()
    );
  }

  describe("constructors and destructors", () => {
    it("roundtrips ((intPart &&& fracPart) . (fromInt &&& const 0))", async () => {
      async function check(i) {
        const sq = await mock.fromInt(i);
        expect(sq).to.equal(toSq(i, 0));
        expect(await mock.intPart(sq)).to.equal(i);
        expect(await mock.fracPart(sq)).to.equal(0);
      }
      await check(0n);
      await check(1n);
      await check(77n);
      await check(-77n);
      await check((1n << 63n) - 1n);
      await check(-1n << 63n);
    });

    it("roundtrips ((intPart &&& fracPart) . fromParts", async () => {
      async function check(i, f) {
        const sq = await mock.fromParts(i, f);
        expect(sq).to.equal(toSq(i, f));
        expect(await mock.intPart(sq)).to.equal(i);
        expect(await mock.fracPart(sq)).to.equal(f);
      }
      await check(0n, 0n);
      await check(1n, 0n);
      await check(1n, SCALE / 4n);
      await check(-1n, SCALE / 4n);
      await check(77n, SCALE / 4n);
      await check(-77n, SCALE / 4n);
      await check((1n << 63n) - 1n, SCALE / 4n);
      await check(-1n << 63n, SCALE / 4n);
    });
  });

  describe("fixed-point operators", () => {
    describe("addition", () => {
      it("adds positive numbers", async () => {
        const a = await mock.fromParts(1, SCALE / 4n);
        const b = await mock.fromParts(3, 7);
        expect(a.add(b)).to.equal(toSq(4, SCALE / 4n + 7n));
        expect(await mock.addFixed(a, b)).to.equal(a.add(b));
      });
      it("adds positive and negative with positive output", async () => {
        const a = await mock.fromParts(1, SCALE / 4n);
        const b = await mock.fromParts(-2, (SCALE * 15n) / 16n);
        expect(a.add(b)).to.equal(toSq(0, (SCALE * 3n) / 16n));
        expect(await mock.addFixed(a, b)).to.equal(a.add(b));
      });
      it("adds positive and negative with negative output", async () => {
        const a = await mock.fromParts(1, SCALE / 4n);
        const b = await mock.fromParts(-2, 0);
        expect(a.add(b)).to.equal(toSq(-1, SCALE / 4n));
        expect(await mock.addFixed(a, b)).to.equal(a.add(b));
      });
      it("adds negative numbers", async () => {
        const a = await mock.fromParts(-2, SCALE / 2n);
        const b = await mock.fromParts(-3, (SCALE * 3n) / 4n);
        expect(a.add(b)).to.equal(toSq(-4, SCALE / 4n));
        expect(await mock.addFixed(a, b)).to.equal(a.add(b));
      });
      it("reverts on overflow", async () => {
        const a = await mock.fromParts((1n << 63n) - 1n, SCALE / 2n);
        const b = await mock.fromParts(0, (SCALE * 3n) / 4n);
        await expect(mock.addFixed(a, b)).to.be.reverted;
      });
      it("reverts on underflow", async () => {
        const a = await mock.fromInt((-1n << 63n) + 2n);
        const b = await mock.fromInt(-7n);
        await expect(mock.addFixed(a, b)).to.be.reverted;
      });
    });

    describe("subtraction", () => {
      it("subtracts positive numbers with positive output", async () => {
        const a = await mock.fromParts(2, SCALE / 4n);
        const b = await mock.fromParts(0, SCALE / 2n);
        expect(a.sub(b)).to.equal(toSq(1, (SCALE * 3n) / 4n));
        expect(await mock.subFixed(a, b)).to.equal(a.sub(b));
      });
      it("subtracts positive numbers with negative output", async () => {
        const a = await mock.fromParts(0, SCALE / 2n);
        const b = await mock.fromParts(2, SCALE / 4n);
        expect(a.sub(b)).to.equal(toSq(-2, SCALE / 4n));
        expect(await mock.subFixed(a, b)).to.equal(a.sub(b));
      });
      it("subtracts positive and negative", async () => {
        const a = await mock.fromParts(1, SCALE / 4n);
        const b = await mock.fromParts(-2, 0);
        expect(a.sub(b)).to.equal(toSq(3, SCALE / 4n));
        expect(await mock.subFixed(a, b)).to.equal(a.sub(b));
      });
      it("subtracts negative and positive", async () => {
        const a = await mock.fromParts(-1, SCALE / 4n);
        const b = await mock.fromParts(2, 0);
        expect(a.sub(b)).to.equal(toSq(-3, SCALE / 4n));
        expect(await mock.subFixed(a, b)).to.equal(a.sub(b));
      });
      it("subtracts negative numbers with positive output", async () => {
        const a = await mock.fromParts(-5, 44);
        const b = await mock.fromParts(-6, 3);
        expect(a.sub(b)).to.equal(toSq(1, 41));
        expect(await mock.subFixed(a, b)).to.equal(a.sub(b));
      });
      it("subtracts negative numbers with negative output", async () => {
        const a = await mock.fromParts(-6, 3);
        const b = await mock.fromParts(-5, 44);
        expect(a.sub(b)).to.equal(toSq(-2, SCALE - 41n));
        expect(await mock.subFixed(a, b)).to.equal(a.sub(b));
      });
      it("reverts on overflow", async () => {
        const a = await mock.fromParts((1n << 63n) - 1n, SCALE / 2n);
        const b = await mock.fromParts(-1, SCALE / 4n);
        await expect(mock.subFixed(a, b)).to.be.reverted;
      });
      it("reverts on underflow", async () => {
        const a = await mock.fromInt((-1n << 63n) + 2n);
        const b = await mock.fromInt(4);
        await expect(mock.subFixed(a, b)).to.be.reverted;
      });
    });
  });
});
