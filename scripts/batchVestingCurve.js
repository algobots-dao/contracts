const hre = require("hardhat");

async function main() {
  // Hardhat accepts `{ quiet: true }` but only partially honors it (omits
  // "Nothing to compile", but still prints "Compilation finished successfully"
  // if it does compile). Fine; I'll do it myself.
  {
    const oldConsoleLog = console.log;
    console.log = () => {};
    await hre.run("compile", { quiet: true });
    console.log = oldConsoleLog;
  }

  const AlgobotsToken = await hre.ethers.getContractFactory("AlgobotsToken");
  const token = await AlgobotsToken.deploy();
  await token.deployed();

  console.log("batches\tbatchesVestedInverse");
  for (let i = 0; i <= 1000; i++) {
    const reltime = await token.batchesVestedInverse(i);
    console.log(`${i}\t${reltime}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
