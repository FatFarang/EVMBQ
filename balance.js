const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const abi =   {
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

// cacheFilePath()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @returns {string} The path to the file where cached data should be stored.
function cacheFilePath(network, address) {
  return path.join(path.join(__dirname, 'cache'), `${network.name}-${address}.json`);
}

// loadCachedData()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @returns {object} An object containing the cached contracts and last block number.
function loadCachedData(network, address) {
  let contracts = {};
  let lastBlock = 0;

  const filepath = cacheFilePath(network, address);

  if (fs.existsSync(filepath)) {
    const cacheData = JSON.parse(fs.readFileSync(filepath));

    contracts = cacheData.contracts;
    lastBlock = cacheData.lastBlock;
  }

  return { contracts, lastBlock }
}

// saveCachedData()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @param {number} endBlock - The block number to stop searching at.
// @param {object} contracts - An object containing the contracts found.
// @returns {void}
function saveCachedData(network, address, endBlock, contracts) {
  const filepath = cacheFilePath(network, address);

  const cacheData = {
    lastBlock: endBlock,
    contracts
  };

  if (!fs.existsSync(path.dirname(filepath))) {
    fs.mkdirSync(path.dirname(filepath));
  }

  fs.writeFileSync(filepath, JSON.stringify(cacheData, null, 4));
}

// fetchTokenContracts()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @returns {object} An object containing the contracts found.
async function fetchTokenContracts(network, address) {
  let { contracts, lastBlock } = loadCachedData(network, address);  
  let web3 = createWeb3(network.rpcUrl); 

  try {
    let endBlock = await web3.eth.getBlockNumber();
    let chunkSize = network.chunkSize;
    let chunkSizeStep = Math.round(chunkSize * 0.1)

    for (let i = lastBlock; i < endBlock; i += chunkSize) {
      console.log(`Looking for tokens on ${network.name} for ${address} ${i}/${endBlock} @ ${chunkSize} (${Math.round(100.0 / endBlock * i * 100) / 100})`);

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

            if(!contracts[tokenAddress]){
              contracts[tokenAddress] = [];
            }

            contracts[tokenAddress] = [
              ...contracts[tokenAddress],
              event
            ];

            console.log(`Found token ${tokenAddress} on ${network.name} for ${address}`);
          }

          saveCachedData(network, address, i, contracts);
          break;
        } catch (err) {
          chunkSize = Math.max(1, Math.round(chunkSize * 0.5));
          if (retry-- < 1) {            
            throw err;
          }else{
            console.log(`Looking for token on ${network.name} for ${address} failed: ${err.message} retrying...`);
            web3.currentProvider.disconnect();
            web3 = createWeb3(network.rpcUrl); 
          }
        }
      }
    }
  } catch (err){
    throw Error(`Looking for token on ${network.name} for ${address} failed: ${err.message}`)
  } finally {
    web3.currentProvider.disconnect();
  }

  console.log(`Looking for token on ${network.name} for ${address} finished!`);

  return contracts;
}

// fetchTokenBalances()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @returns {object} An object containing the token balances found.
async function fetchTokenBalances(network, address) {
  const contracts = await fetchTokenContracts(network, address);

  const balances = {};
  const web3 = createWeb3(network.rpcUrl);

  for (const tokenAddress in contracts) {
    const tokenContract = new web3.eth.Contract(abi.abi, tokenAddress);

    try {      
      console.log(`Looking for balance for ${tokenAddress}, ${abi.type} on ${network.name} for ${address}`);
      const balance = await tokenContract.methods.balanceOf(address).call();

      balances[tokenAddress] = {
        type: abi.type,
        balance: balance
      };

      console.log(`Looking for balance for ${tokenAddress}, ${abi.type} on ${network.name} for ${address} returned ${balance}`);

    } catch (err) {
      console.log(`Looking for balance for ${tokenAddress}, ${abi.type} on ${network.name} for ${address} failed!`, err.message);
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