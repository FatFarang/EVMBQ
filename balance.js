const Web3 = require('web3');
const { saveBalanceData, saveCachedData, loadCachedData, readBalancesFromDirectory } = require('./storage');

const abi = {
  "type": "ERC20",
  "abi": [
    {
      "constant": false,
      "inputs": [
        {
          "name": "_to",
          "type": "address"
        },
        {
          "name": "_value",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "_owner",
          "type": "address"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "name": "balance",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "name",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    }
  ]
};

const config = {
  log: {
    fetchTokenContracts: {
      debug: false,
      info: false,
      begin: false,
      end: false,
      progress: true,
    },
    fetchTokenBalances: {
      debug: false,
      begin: false,
      end: false,
      progress: true,
    },
  }
}

// createWeb3()
// @param {string} rpcUrl - The URL of the RPC endpoint to connect to. Must start with either 'http' or 'wss'.
// @returns {Web3} A Web3 instance connected to the given RPC endpoint.
function createWeb3(rpcUrl) {
  if (rpcUrl.toLowerCase().startsWith('http')) {
    return new Web3(new Web3.providers.HttpProvider(rpcUrl));
  }
  if (rpcUrl.toLowerCase().startsWith('wss')) {
    return new Web3(new Web3.providers.WebsocketProvider(rpcUrl));
  }
}

// fetchTokenContracts()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @returns {object} An object containing the contracts found.
async function fetchTokenContracts(network, address) {
  let { contracts, lastBlock } = loadCachedData(network, address);
  let web3 = createWeb3(network.rpcUrl);

  if (config.log.fetchTokenContracts.begin) {
    console.log(`Looking for token on ${network.name} for ${address}`);
  }

  try {
    let endBlock = await web3.eth.getBlockNumber();
    let chunkSize = network.chunkSize;
    let chunkSizeStep = Math.round(chunkSize * 0.1)

    for (let i = lastBlock; i < endBlock; i += chunkSize) {
      if (config.log.fetchTokenContracts.progress) {
        console.log(`Looking for tokens on ${network.name} for ${address} ${i}/${endBlock} @ ${chunkSize} (${Math.round(100.0 / endBlock * i * 100) / 100})`);
      }

      let retry = 5;

      while (1) {
        try {
          const options = {
            fromBlock: i,
            toBlock: Math.min(i + chunkSize - 1, endBlock),
            topics: [
              web3.utils.sha3('Transfer(address,address,uint256)'),
              null,
              "0x" + address.toLowerCase().substring(2).padStart(64, "0")
            ]
          };

          const startTime = Date.now();
          const events = await web3.eth.getPastLogs(options);
          const elapsedTime = Date.now() - startTime;

          if (elapsedTime > 6000) {
            chunkSize = Math.max(1, Math.round(chunkSize - chunkSizeStep));
          } else if (elapsedTime < 3000) {
            chunkSize = Math.min(network.chunkSize * 10, Math.round(chunkSize + chunkSizeStep));
          }

          for (const event of events) {
            const tokenAddress = event.address.toLowerCase();

            if (!contracts[tokenAddress]) {
              contracts[tokenAddress] = [];
            }

            contracts[tokenAddress] = [
              ...contracts[tokenAddress],
              event
            ];

            if (config.log.fetchTokenContracts.info) {
              console.log(`Found token ${tokenAddress} on ${network.name} for ${address}`);
            }
          }

          saveCachedData(network, address, i, contracts);
          break;
        } catch (err) {
          chunkSize = Math.max(1, Math.round(chunkSize * 0.5));
          if (retry-- < 1) {
            throw err;
          } else {
            if (config.log.fetchTokenContracts.debug) {
              console.log(`Looking for token on ${network.name} for ${address} failed: ${err.message} retrying...`);
            }
            web3.currentProvider.disconnect();
            web3 = createWeb3(network.rpcUrl);
          }
        }
      }
    }
  } catch (err) {
    throw Error(`Looking for token on ${network.name} for ${address} failed: ${err.message}`)
  } finally {
    web3.currentProvider.disconnect();
  }

  if (config.log.fetchTokenContracts.end) {
    console.log(`Looking for token on ${network.name} for ${address} finished!`);
  }

  return contracts;
}

// fetchTokenBalances()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @returns {object} An object containing the token balances found.
async function fetchTokenBalances(network, address) {
  const contracts = await fetchTokenContracts(network, address);
  const cachedBalances = readBalancesFromDirectory('./data');

  const balances = {};
  const web3 = createWeb3(network.rpcUrl);

  for (const tokenAddress in contracts) {
    const tokenContract = new web3.eth.Contract(abi.abi, tokenAddress);

    try {
      if (config.log.fetchTokenBalances.begin) {
        console.log(`Looking for balance for ${tokenAddress}, ${abi.type} on ${network.name} for ${address}`);
      }

      const tokenName = await tokenContract.methods.name().call();
      const balance = await tokenContract.methods.balanceOf(address).call();
      let status = 'new';

      if (cachedBalances[network.name] &&
        cachedBalances[network.name][address] &&
        cachedBalances[network.name][address].some((cachedToken) => cachedToken.hasOwnProperty(tokenAddress))
      ) {
        const cachedToken = cachedBalances[network.name][address].find((x) => x.hasOwnProperty(tokenAddress));
        const cachedBalance = cachedToken[tokenAddress].balance;

        status = balance !== cachedBalance ? 'changed' : 'unchanged';

        if (balance !== cachedBalance) {
          if (config.log.fetchTokenBalances.progress) {
            console.log(`Detected changed balance for ${tokenAddress} on ${network.name} for ${address}`);
          }
        } else {
          if (config.log.fetchTokenBalances.debug) {
            console.log(`No balance changed detected for known token ${tokenAddress} on ${network.name} for ${address}`);
          }
        }
      } else {
        if (config.log.fetchTokenBalances.progress) {
          console.log(`Detected new token ${tokenAddress} on ${network.name} for ${address}`);
        }
      }

      balances[tokenAddress] = {
        status: status,
        type: abi.type,
        name: tokenName,
        balance: balance
      };
    } catch (err) {
      if (config.log.fetchTokenBalances.end) {
        console.log(`Looking for balance for ${tokenAddress}, ${abi.type} on ${network.name} for ${address} failed!`, err.message);
      }
    }
  }

  web3.currentProvider.disconnect();

  return balances;
}


// fetchAllTokenBalances()
// @param {array} networks - An array of network objects with properties name and id.
// @param {array} addresses - An array of Ethereum addresses.
// @returns {object} balances - An object containing the token balances for each address in each network.
async function fetchAllTokenBalances(networks, addresses) {
  const __fn_query = async (network) => {
    const balances = {
      [network.name]: {}
    };

    for (const address of addresses) {
      let tokenBalance = await fetchTokenBalances(network, address);
      balances[network.name][address] = { ...balances[network.name][address], ...tokenBalance }

      saveBalanceData(network, address, balances[network.name][address]);
    }

    return balances;
  }

  const promises = [];

  for (const network of networks) {
    if (network.enabled) {
      promises.push(__fn_query(network));
    }
  }

  return Promise.all(promises);
}

module.exports = {
  fetchTokenContracts,
  fetchTokenBalances,
  fetchAllTokenBalances
};