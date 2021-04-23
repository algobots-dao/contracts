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

  describe("log2", () => {
    function floatToSq(z) {
      const intPart = BigInt(Math.floor(z)) * 2n ** 64n;
      const fracPart = BigInt((z - Math.floor(z)) * 2 ** 64);
      return ethers.BigNumber.from(intPart + fracPart);
    }
    function fromSqApprox(z) {
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
      async function check(z) {
        await expect(mock.log2(z)).to.be.revertedWith(
          "SQ64x64: log2 domain error"
        );
      }
      await check(toSq(0, 0));
      await check(toSq(-1, SCALE - 1n));
      await check(toSq(-1, 0));
      await check(toSq(-8, SCALE / 2n));
      await check(toSq(-SCALE / 2n, SCALE - 1n));
    });

    it("computes logarithms for exact powers of 2", async () => {
      expect(fromSqApprox(await mock.log2(floatToSq(1)))).to.equal(0);
      expect(fromSqApprox(await mock.log2(floatToSq(2)))).to.equal(1);
      expect(fromSqApprox(await mock.log2(floatToSq(4)))).to.equal(2);
      expect(fromSqApprox(await mock.log2(floatToSq(0.5)))).to.equal(-1);
      expect(fromSqApprox(await mock.log2(floatToSq(0.25)))).to.equal(-2);
    });

    it("computes transcendental logarithms", async () => {
      expect(fromSqApprox(await mock.log2(floatToSq(3)))).to.equal(
        Math.log2(3)
      );
      expect(fromSqApprox(await mock.log2(floatToSq(Math.PI)))).to.equal(
        Math.log2(Math.PI)
      );
      expect(fromSqApprox(await mock.log2(floatToSq(0.1)))).to.equal(
        Math.log2(0.1)
      );
    });

    it("computes logarithms of very small inputs", async () => {
      expect(fromSqApprox(await mock.log2(1))).to.equal(-64);
      expect(fromSqApprox(await mock.log2(2))).to.equal(-63);
      expect(fromSqApprox(await mock.log2(3))).to.equal(-64 + Math.log2(3));
      expect(fromSqApprox(await mock.log2(4))).to.equal(-62);
      expect(fromSqApprox(await mock.log2(5))).to.equal(-64 + Math.log2(5));
    });

    it("computes reduced-precision logarithms", async () => {
      const log = Math.log2(3);
      const three = toSq(3, 0);
      // fractional part of log_2(3) to 53 bits of precision
      const approxFracPart = BigInt(Math.floor(log * Number(SCALE))) % SCALE;
      expect(await mock.log2Approx(three, 53)).to.equal(
        toSq(1, approxFracPart)
      );
      expect(await mock.log2Approx(three, 16)).to.equal(
        toSq(1, approxFracPart & ~((1n << 48n) - 1n))
      );
      expect(await mock.log2Approx(three, 4)).to.equal(
        toSq(1, approxFracPart & ~((1n << 60n) - 1n))
      );
      expect(await mock.log2Approx(three, 2)).to.equal(toSq(1, SCALE / 2n));
      expect(await mock.log2Approx(three, 0)).to.equal(toSq(1, 0));
    });

    it("takes less gas to compute reduced-precision logarithms", async () => {
      const three = toSq(3, 0);
      const [gas64, gas32, gas16, gas4, gas0] = await Promise.all(
        [64, 32, 16, 4, 0].map((p) =>
          mock.estimateGas.log2Approx(three, p).then((gas) => gas.toNumber())
        )
      );
      expect({ gas64, gas32, gas16, gas4, gas0 }).to.deep.equal({
        gas64: 113922,
        gas32: 66664,
        gas16: 44727,
        gas4: 28803,
        gas0: 23201,
      });
    });
  });
});
