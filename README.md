# Flashbots ENS Rescue

This package helps rescue ENS names using Flashbots.

## Usage

```
git clone https://github.com/arachnid/flashbots-ens-rescue.git
cd flashbots-ens-rescue
yarn
yarn start [args]
```

Available command line arguments:

```
Options:
  -r --rpc <url>             RPC URL to proxy to (default: "http://localhost:8545/")
  -f --from <private key>    Private key of compromised account to transfer from
  -t --to <address>          Address to transfer names to
  -n --names <names>         Comma-separated list of names to transfer
  -f --funder <private key>  Private key of account to fund the transactions
  -g --gasprice <number>     Gas price in GWEI to pay for all transactions (default: "100")
  -h, --help                 display help for command
```

Arguments that are not supplied on the command line will be prompted for interactively.

Once all arguments are provided, a bundle will be constructed that funds the compromised account and rescues the names atomically.
