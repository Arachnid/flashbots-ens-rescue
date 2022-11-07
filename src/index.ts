import { FlashbotsBundleProvider, FlashbotsBundleResolution, FlashbotsTransactionResponse, RelayResponseError, SimulationResponseSuccess } from '@flashbots/ethers-provider-bundle';
import { Command } from 'commander';
import ethers from 'ethers';
import * as readline from 'node:readline/promises';

const REGISTRAR_INTERFACE = [
    'function transferFrom(address from, address to, uint256 tokenId)'
]

const program = new Command();
program
  .option('-r --rpc <url>', 'RPC URL to proxy to', 'http://localhost:8545/')
  .option('-f --from <private key>', 'Private key of compromised account to transfer from', undefined)
  .option('-t --to <address>', 'Address to transfer names to', undefined)
  .option('-n --names <names>', 'Comma-separated list of names to transfer', undefined)
  .option('-f --funder <private key>', 'Private key of account to fund the transactions', undefined)
  .option('-g --gasprice <number>', 'Gas price in GWEI to pay for all transactions', '100');

program.parse(process.argv);

const options = program.opts();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function isRelayResponseError(r: FlashbotsTransactionResponse | SimulationResponseSuccess | RelayResponseError): r is RelayResponseError {
  return (r as any)?.error !== undefined;
}

(async function() {
  const provider = new ethers.providers.JsonRpcProvider({ url: options.rpc });
  const registry = new ethers.Contract('registrar.ens.eth', REGISTRAR_INTERFACE, provider);
  const authSigner = new ethers.Wallet(ethers.utils.randomBytes(32));
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);

  if(!options.from) {
      options.from = await rl.question('Private key for compromised account > ');
  }
  const fromSigner = ((options.from as string).includes(' ') ? ethers.Wallet.fromMnemonic(options.from) : new ethers.Wallet(options.from)).connect(provider);
  console.log(`Compromised account address: ${fromSigner.address}`);

  if(!options.to) {
      options.to = await rl.question('Address to transfer names to > ');
  }

  if(!options.names) {
      options.names = await rl.question('Comma-separated list of names to transfer > ');
  }

  if(!options.funder) {
      options.funder = await rl.question('Private key of account to fund the transactions > ');
  }
  const funderSigner = ((options.funder as string).includes(' ') ? ethers.Wallet.fromMnemonic(options.funder) : new ethers.Wallet(options.funder)).connect(provider);

  const names = options.names.split(',');
  const labelhashes = names.map((name: string) => ethers.utils.id(name.split('.')[0])) as string[];

  console.log(`Calculating gas required for ${labelhashes.length + 1} transactions...`);
  const gasLimits = await Promise.all(
    labelhashes.map(
      (hash: string) => registry.estimateGas.transferFrom(fromSigner.address, options.to, hash, {from: fromSigner.address})
    )
  );
  const totalGas = gasLimits.reduce((accum, gas) => gas.toNumber() + accum, 0) + 21000;
  
  const gasPrice = ethers.utils.parseUnits(options.gasprice, 'gwei');
  const ethRequired = gasPrice.mul(totalGas);
  const rescueTransactions = await Promise.all(
    labelhashes.map(async (hash: string, index: number) => ({
      transaction: await registry.populateTransaction.transferFrom(
        fromSigner.address,
        options.to,
        hash,
        {
          gasPrice,
          gasLimit: gasLimits[index],
        }
      ),
      signer: fromSigner,
    }))
  );
  const bundle = [
    {
      signer: funderSigner,
      transaction: {
        to: fromSigner.address,
        value: ethRequired,
        gasPrice,
      } as ethers.PopulatedTransaction
    }
  ].concat(rescueTransactions);

  while(true) {
    const blockNumber = 1 + await provider.getBlockNumber();
    console.log(`Attempting to submit bundle at block number ${blockNumber}`);
    const txresponse = await flashbotsProvider.sendBundle(bundle, blockNumber);

    if(isRelayResponseError(txresponse)) {
      console.log(`Error submitting bundle: ${txresponse.error.message}`);
      process.exit(1);
    }

    const sim = await txresponse.simulate();
    if(isRelayResponseError(sim)) {
      console.log(`Simulation produced an error: ${sim.error}`);
      process.exit(1);
    }
    console.log(`Simulation result: ${sim.firstRevert === undefined ? 'success': 'failure'}`);
    if(sim.firstRevert) {
      process.exit(1);
    }

    const status = await txresponse.wait();
    switch(status) {
    case FlashbotsBundleResolution.BundleIncluded:
      console.log("Bundle mined!");
      process.exit(0);
    case FlashbotsBundleResolution.AccountNonceTooHigh:
      console.log("Failed ot mine bundle: account nonce too high.");
      process.exit(1);
    default:
      console.log("Failed to include bundle in block; trying again.");
    }
  }

  process.exit(0);
})();
