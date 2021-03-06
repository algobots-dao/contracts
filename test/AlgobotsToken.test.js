const { expect } = require("chai");

describe("AlgobotsToken", () => {
  const EXA = 10n ** 18n;
  const BATCHES = 1000;

  let AlgobotsToken, AlgobotsTokenMock, Clock, ERC721Mock;
  let clock;
  before(async () => {
    AlgobotsToken = await ethers.getContractFactory("AlgobotsToken");
    AlgobotsTokenMock = await ethers.getContractFactory("AlgobotsTokenMock");
    Clock = await ethers.getContractFactory("Clock");
    ERC721Mock = await ethers.getContractFactory("ERC721Mock");
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

  describe("ERC-20 metadata", () => {
    let token;
    before(async () => {
      token = await AlgobotsToken.deploy();
      await token.deployed();
    });

    it("has name", async () => {
      expect(await token.name()).to.equal("Algobots");
    });
    it("has symbol", async () => {
      expect(await token.symbol()).to.equal("BOTS");
    });
    it("has decimals", async () => {
      expect(await token.decimals()).to.equal(18);
    });
  });

  describe("cumulativeBatches", () => {
    it("performs basic linear interpolation", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      const t0 = await now();
      const startTime = t0 + 10;
      const reltimes = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          token.batchesVestedInverse(n).then((t) => BigInt(t))
        )
      );
      const finalReltime = BigInt(await token.batchesVestedInverse(BATCHES));

      async function expectBatchesEqual(full, atto) {
        function bignum(x) {
          return ethers.BigNumber.from(x).toString();
        }
        const actual = (await token.cumulativeBatches()).map(bignum);
        const expected = [full, atto].map(bignum);
        expect(expected).to.deep.equal(actual);
      }

      await token.setVestingSchedule(startTime);
      expect(await now()).to.be.lessThan(startTime);
      await expectBatchesEqual(0, 0);

      await setNow(startTime + 1);
      await expectBatchesEqual(0, EXA / reltimes[0]);

      {
        const half = reltimes[0] / 2n;
        await setNow(startTime + Number(half));
        await expectBatchesEqual(0, (EXA * half) / reltimes[0]);
      }

      await setNow(startTime + Number(reltimes[0]));
      await expectBatchesEqual(1, 0);

      await setNow(startTime + Number(reltimes[0]) + 7);
      await expectBatchesEqual(1, (EXA * 7n) / (reltimes[1] - reltimes[0]));
      await token.cacheCumulativeBatches();
      expect(await now()).to.equal(startTime + Number(reltimes[0]) + 8);
      await expectBatchesEqual(1, (EXA * 8n) / (reltimes[1] - reltimes[0]));

      await setNow(startTime + Number(reltimes[2]) - 12);
      await expectBatchesEqual(
        2,
        (EXA * (reltimes[2] - reltimes[1] - 12n)) / (reltimes[2] - reltimes[1])
      );
      await setNext(startTime + Number(reltimes[2]) - 1);
      await token.cacheCumulativeBatches();
      expect(await now()).to.equal(startTime + Number(reltimes[2]) - 1);
      await expectBatchesEqual(
        2,
        (EXA * (reltimes[2] - reltimes[1] - 1n)) / (reltimes[2] - reltimes[1])
      );
      await token.cacheCumulativeBatches();
      expect(await now()).to.equal(startTime + Number(reltimes[2]));
      await expectBatchesEqual(3, 0);

      await setNow(startTime + Number(finalReltime) - 7);
      await token.setFullyVestedBatches(BATCHES - 1);

      await setNow(startTime + Number(finalReltime) + 7);
      await expectBatchesEqual(BATCHES, 0);
      await token.cacheCumulativeBatches();
      await expectBatchesEqual(BATCHES, 0);

      await setNow(startTime + Number(finalReltime) + 10 ** 8);
      await expectBatchesEqual(BATCHES, 0);
      await token.cacheCumulativeBatches();
      await expectBatchesEqual(BATCHES, 0);
    });
  });

  describe("setOwner", () => {
    it("permits only the current owner to transfer power", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();
      const [oldOwner, newOwner] = await ethers.getSigners();

      expect(await token.owner()).to.equal(oldOwner.address);
      await expect(
        token.connect(newOwner).setOwner(newOwner.address)
      ).to.be.revertedWith("AlgobotsToken: unauthorized for owner");

      await token.connect(oldOwner).setOwner(newOwner.address);

      expect(await token.owner()).to.equal(newOwner.address);
      await expect(
        token.connect(oldOwner).setOwner(newOwner.address)
      ).to.be.revertedWith("AlgobotsToken: unauthorized for owner");
    });
  });

  describe("claimBotTokens", () => {
    async function setUp() {
      const signers = await ethers.getSigners();

      const token = await AlgobotsToken.deploy();
      const artblocks = await ERC721Mock.deploy();
      await Promise.all([token.deployed(), artblocks.deployed()]);

      const startTime = await now();
      await token.setVestingSchedule(startTime);
      await token.setArtblocks(artblocks.address);

      return {
        token,
        artblocks,
        startTime,
        signers,
      };
    }

    describe("sends tokens when authorized", () => {
      it("by the bot holder", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, dst],
        } = await setUp();
        const botId = 342;
        const nftId = 40000342;
        await artblocks.mint(holder.address, nftId);

        const reltime7 = await token.batchesVestedInverse(7);
        const reltime8 = await token.batchesVestedInverse(8);
        await setNext(startTime + reltime7);
        expect(await token.balanceOf(dst.address)).to.equal(0);
        await token.connect(holder).claimBotTokens(dst.address, botId);
        expect(await token.balanceOf(dst.address)).to.equal(EXA * 7n);
        await token.connect(holder).claimBotTokens(dst.address, botId);
        expect(await token.balanceOf(dst.address)).to.equal(
          String(EXA * 7n + EXA / BigInt(reltime8 - reltime7))
        );
      });

      it("by the bot operator", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, operator, dst],
        } = await setUp();
        const botId = 342;
        const nftId = 40000342;
        await artblocks.mint(holder.address, nftId);
        await artblocks.connect(holder).approve(operator.address, nftId);

        const reltime7 = await token.batchesVestedInverse(7);
        await setNext(startTime + reltime7);
        expect(await token.balanceOf(dst.address)).to.equal(0);
        await token.connect(operator).claimBotTokens(dst.address, botId);
        expect(await token.balanceOf(dst.address)).to.equal(EXA * 7n);
      });

      it("by the bot holder's universal operator", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, operator, dst],
        } = await setUp();
        const botId = 342;
        const nftId = 40000342;
        await artblocks.mint(holder.address, nftId);
        await artblocks
          .connect(holder)
          .setApprovalForAll(operator.address, true);

        const reltime7 = await token.batchesVestedInverse(7);
        await setNext(startTime + reltime7);
        expect(await token.balanceOf(dst.address)).to.equal(0);
        await token.connect(operator).claimBotTokens(dst.address, botId);
        expect(await token.balanceOf(dst.address)).to.equal(EXA * 7n);
      });
    });

    describe("does not send tokens when not authorized", () => {
      it("at request of arbitrary user", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, dst, rando],
        } = await setUp();
        const botId = 342;
        const nftId = 40000342;
        await artblocks.mint(holder.address, nftId);

        const reltime7 = await token.batchesVestedInverse(7);
        await setNext(startTime + reltime7);
        await expect(
          token.connect(rando).claimBotTokens(dst.address, botId)
        ).to.be.revertedWith("AlgobotsToken: unauthorized for bot");
      });

      it("at request of contract owner", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, dst],
        } = await setUp();
        const botId = 342;
        const nftId = 40000342;
        await artblocks.mint(holder.address, nftId);

        const reltime7 = await token.batchesVestedInverse(7);
        await setNext(startTime + reltime7);
        await expect(
          token.connect(admin).claimBotTokens(dst.address, botId)
        ).to.be.revertedWith("AlgobotsToken: unauthorized for bot");
      });

      it("if no bot by the given ID exists", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, dst],
        } = await setUp();
        const botId = 404;
        const reltime7 = await token.batchesVestedInverse(7);
        await setNext(startTime + reltime7);
        await expect(
          token.connect(holder).claimBotTokens(dst.address, botId)
        ).to.be.revertedWith("ERC721: owner query for nonexistent token");
      });

      it("if the bot ID is out of range", async () => {
        const {
          token,
          artblocks,
          startTime,
          signers: [admin, holder, dst],
        } = await setUp();
        const botId = 505;
        const reltime7 = await token.batchesVestedInverse(7);
        await setNext(startTime + reltime7);
        await expect(
          token.connect(holder).claimBotTokens(dst.address, botId)
        ).to.be.revertedWith("AlgobotsToken: botId out of range");
      });
    });

    it("refuses to send tokens to the zero address", async () => {
      const {
        token,
        artblocks,
        startTime,
        signers: [admin, holder, dst],
      } = await setUp();
      const botId = 342;
      const nftId = 40000342;
      await artblocks.mint(holder.address, nftId);

      const reltime7 = await token.batchesVestedInverse(7);
      await setNext(startTime + reltime7);
      await expect(
        token
          .connect(holder)
          .claimBotTokens(ethers.constants.AddressZero, botId)
      ).to.be.revertedWith("AlgobotsToken: null destination");
    });

    it("sends zero tokens if called twice within one transaction", async () => {
      const {
        token,
        artblocks,
        startTime,
        signers: [admin, holder, dst],
      } = await setUp();
      const mock = await AlgobotsTokenMock.deploy(token.address);
      await mock.deployed();

      const botId = 342;
      const nftId = 40000342;
      await artblocks.mint(holder.address, nftId);
      await artblocks.connect(holder).approve(mock.address, nftId);

      const reltime7 = await token.batchesVestedInverse(7);
      await setNext(startTime + reltime7);
      expect(await token.balanceOf(dst.address)).to.equal(0n);
      await mock.connect(holder).claimBotTokensTwice(dst.address, botId);
      expect(await token.balanceOf(dst.address)).to.equal(7n * EXA);
    });
  });

  describe("claimBotTokensMany", () => {
    async function setUp() {
      const signers = await ethers.getSigners();

      const token = await AlgobotsToken.deploy();
      const artblocks = await ERC721Mock.deploy();
      await Promise.all([token.deployed(), artblocks.deployed()]);

      const startTime = await now();
      await token.setVestingSchedule(startTime);
      await token.setArtblocks(artblocks.address);

      return {
        token,
        artblocks,
        startTime,
        signers,
      };
    }

    it("sends tokens for multiple authorization methods", async () => {
      const {
        token,
        artblocks,
        startTime,
        signers: [admin, holder, op1, op2, dst],
      } = await setUp();
      const botIds = [75, 221, 430];
      const nftIds = [40000075, 40000221, 40000430];

      await artblocks.mint(holder.address, nftIds[0]);
      await artblocks.mint(op1.address, nftIds[1]);
      await artblocks.connect(op1).approve(holder.address, nftIds[1]);
      await artblocks.mint(op2.address, nftIds[2]);
      await artblocks.connect(op2).setApprovalForAll(holder.address, true);

      const reltime1 = await token.batchesVestedInverse(1);
      await setNext(startTime + reltime1);
      expect(await token.balanceOf(dst.address)).to.equal(0);
      await token.connect(holder).claimBotTokensMany(dst.address, botIds);
      expect(await token.balanceOf(dst.address)).to.equal(EXA * 3n);
    });

    it("reverts if any bot unauthorized", async () => {
      const {
        token,
        artblocks,
        startTime,
        signers: [admin, holder, other],
      } = await setUp();
      const botIds = [75, 221, 430];
      const nftIds = [40000075, 40000221, 40000430];

      await artblocks.mint(holder.address, nftIds[0]);
      await artblocks.mint(holder.address, nftIds[1]);
      await artblocks.mint(other.address, nftIds[2]);

      const reltime1 = await token.batchesVestedInverse(1);
      await setNext(startTime + reltime1);
      await expect(
        token.connect(holder).claimBotTokensMany(holder.address, botIds)
      ).to.be.revertedWith("AlgobotsToken: unauthorized for bot");
    });

    it("works with lots of bots", async () => {
      const {
        token,
        artblocks,
        startTime,
        signers: [admin, holder, dst],
      } = await setUp();
      const botIds = Array(50)
        .fill()
        .map((_, i) => i);
      const nftIds = botIds.map((i) => 40000000 + i);

      await artblocks.mintMany(holder.address, nftIds);

      const reltime1 = await token.batchesVestedInverse(1);
      await setNext(startTime + reltime1);
      await token.connect(holder).claimBotTokensMany(dst.address, botIds);
      expect(await token.balanceOf(dst.address)).to.equal(EXA * 50n);

      const reltime3 = await token.batchesVestedInverse(3);
      await setNext(startTime + reltime3);
      await token.connect(holder).claimBotTokensMany(holder.address, botIds);
      expect(await token.balanceOf(holder.address)).to.equal(EXA * 50n * 2n);
    });

    it("refuses to send tokens to the zero address", async () => {
      const {
        token,
        artblocks,
        startTime,
        signers: [admin, holder, dst],
      } = await setUp();
      const botIds = [75, 221, 430];
      const nftIds = [40000075, 40000221, 40000430];
      await artblocks.mintMany(holder.address, nftIds);

      const reltime1 = await token.batchesVestedInverse(1);
      await setNext(startTime + reltime1);
      await expect(
        token
          .connect(holder)
          .claimBotTokensMany(ethers.constants.AddressZero, botIds)
      ).to.be.revertedWith("AlgobotsToken: null destination");
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
      const reltimes = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          token.batchesVestedInverse(n).then((t) => BigInt(t))
        )
      );
      const finalReltime = BigInt(await token.batchesVestedInverse(BATCHES));

      await token.setVestingSchedule(startTime);

      expect(await now()).to.be.lessThan(startTime);
      await token.connect(artist).claimArtistTokens(artist.address);
      expect(await token.balanceOf(artist.address)).to.equal(0);

      await setNext(startTime + 1);
      expect(await token.balanceOf(artist.address)).to.equal(0);
      await token.connect(artist).claimArtistTokens(artist.address);
      expect(await token.balanceOf(artist.address)).to.equal(
        (EXA / reltimes[0]) * 100n
      );

      await setNext(startTime + Number(reltimes[0]) - 5);
      await token.connect(artist).claimArtistTokens(artist.address);
      const balanceAfterTwoClaims = BigInt(
        await token.balanceOf(artist.address)
      );
      expect(balanceAfterTwoClaims).to.equal(
        ((EXA * (reltimes[0] - 5n)) / reltimes[0]) * 100n
      );

      await token
        .connect(artist)
        .transfer(mule.address, balanceAfterTwoClaims - 7n);
      expect(await token.balanceOf(artist.address)).to.equal(7n);
      expect(await token.balanceOf(mule.address)).to.equal(
        balanceAfterTwoClaims - 7n
      );

      await setNext(startTime + Number(reltimes[2]) + 8);
      await token.connect(artist).claimArtistTokens(mule.address);
      expect(await token.balanceOf(artist.address)).to.equal(7n);
      expect(await token.balanceOf(mule.address)).to.equal(
        (EXA * 3n + (EXA * 8n) / (reltimes[3] - reltimes[2])) * 100n - 7n
      );

      await setNow(startTime + Number(finalReltime) + 77);
      await token.setFullyVestedBatches(BATCHES);
      await token.connect(artist).claimArtistTokens(mule.address);
      expect(await token.balanceOf(artist.address)).to.equal(7n);
      expect(await token.balanceOf(mule.address)).to.equal(
        EXA * BigInt(BATCHES) * 100n - 7n
      );

      await setNow(startTime + Number(finalReltime) + 10 ** 8);
      await token.connect(artist).claimArtistTokens(mule.address);
      expect(await token.balanceOf(artist.address)).to.equal(7n);
      expect(await token.balanceOf(mule.address)).to.equal(
        EXA * BigInt(BATCHES) * 100n - 7n
      );
    });

    it("refuses to send tokens to the zero address", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      const [admin, artist] = await ethers.getSigners();
      await token.connect(admin).setArtist(artist.address);

      const startTime = await now();
      await token.setVestingSchedule(startTime);
      const reltime1 = await token.batchesVestedInverse(1);
      await setNext(startTime + reltime1);

      await expect(
        token.connect(artist).claimArtistTokens(ethers.constants.AddressZero)
      ).to.be.revertedWith("AlgobotsToken: null destination");
    });
  });

  describe("claimTreasuryTokens", () => {
    it("refuses to send to null address", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();
      await token.setVestingSchedule(await now());

      const [admin, user] = await ethers.getSigners();
      await expect(
        token.connect(user).claimTreasuryTokens()
      ).to.be.revertedWith("AlgobotsToken: no treasury address");
    });

    it("sends to treasury", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      const [admin, treasury, user] = await ethers.getSigners();
      await token.setTreasury(treasury.address);

      const startTime = await now();
      await token.setVestingSchedule(await now());
      const reltime1 = await token.batchesVestedInverse(1);
      const reltime2 = await token.batchesVestedInverse(2);

      expect(await token.balanceOf(treasury.address)).to.equal(0);
      await setNext(startTime + reltime1);
      await token.connect(user).claimTreasuryTokens();
      expect(await token.balanceOf(treasury.address)).to.equal(EXA * 200n);
      await setNext(startTime + reltime2);
      await token.connect(user).claimTreasuryTokens();
      expect(await token.balanceOf(treasury.address)).to.equal(EXA * 400n);
    });
  });

  describe("claimCommunityTokens", () => {
    it("refuses to send to null address", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();
      await token.setVestingSchedule(await now());

      const [admin, user] = await ethers.getSigners();
      await expect(
        token.connect(user).claimCommunityTokens()
      ).to.be.revertedWith("AlgobotsToken: no community address");
    });

    it("sends to community", async () => {
      const token = await AlgobotsToken.deploy();
      await token.deployed();

      const [admin, community, user] = await ethers.getSigners();
      await token.setCommunity(community.address);

      const startTime = await now();
      await token.setVestingSchedule(await now());
      const reltime1 = await token.batchesVestedInverse(1);
      const reltime2 = await token.batchesVestedInverse(2);

      expect(await token.balanceOf(community.address)).to.equal(0);
      await setNext(startTime + reltime1);
      await token.connect(user).claimCommunityTokens();
      expect(await token.balanceOf(community.address)).to.equal(EXA * 200n);
      await setNext(startTime + reltime2);
      await token.connect(user).claimCommunityTokens();
      expect(await token.balanceOf(community.address)).to.equal(EXA * 400n);
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

    describe("cached vesting curve", () => {
      it("matches on-chain answers for all inputs", async () => {
        const expected = require("./expectedVestingCurve.json");
        const mock = await AlgobotsTokenMock.deploy(token.address);
        await mock.deployed();
        const result = await mock.computeAllBatchesVestedInverse();
        expect(result).to.deep.equal(expected);
      });
      it("is strictly increasing", () => {
        const expected = require("./expectedVestingCurve.json");
        for (let i = 1; i < expected.length; i++) {
          const [prev, curr] = [expected[i - 1], expected[i]];
          if (!(curr > prev)) {
            expect(curr).to.be.greaterThan(prev);
          }
        }
      });
    });
  });
});
