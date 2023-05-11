const Web3 = require('web3');
const fs = require('fs');
const path = require('path');


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

  fs.writeFileSync(filepath, JSON.stringify(cacheData));
}

// fetchTokenContracts()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @param {object} abi - An object containing the ABI of the contract to search for tokens.
// @returns {object} An object containing the contracts found.
async function fetchTokenContracts(network, address, abi) {
  let { contracts, lastBlock } = loadCachedData(network, address);

  const web3 = createWeb3(network.rpcUrl);

  const contract = new web3.eth.Contract(abi.abi, address);
  const endBlock = await web3.eth.getBlockNumber();
  let chunkSize = network.chunkSize;

  for (let i = lastBlock; i < endBlock; i += chunkSize) {
    const options = {
      fromBlock: i,
      toBlock: Math.min(i + chunkSize - 1, endBlock),
      filter: {
        to: address
      }
    };

    console.log(`Looking for tokens on ${network.name} for ${address} ${i}/${endBlock} @ ${chunkSize} (${Math.round(100.0 / endBlock * i * 100) / 100})`);
    const startTime = Date.now();
    const events = await contract.getPastEvents('Transfer', options);
    const elapsedTime = Date.now() - startTime;

    if (elapsedTime > 6000) {
      chunkSize = Math.max(1, Math.round(network.chunkSize * 0.9));
    } else if (elapsedTime < 3000) {
      chunkSize = Math.min(network.chunkSize * 2, Math.round(network.chunkSize * 1.1));
    }

    for (const event of events) {      
      const tokenAddress = event.address.toLowerCase();

      contracts[tokenAddress] = {
        type: abi.type
      };
      
      console.log(`Found token on ${network.name} for ${address} `);
    }

    saveCachedData(network, address, i, contracts);
  }


  return contracts;
}

// fetchTokenBalances()
// @param {object} network - An object containing information about the network to connect to.
// @param {string} address - The address of the account to fetch token balances for.
// @param {object} abi - An object containing the ABI of the contract to search for tokens.
// @returns {object} An object containing the token balances found.
async function fetchTokenBalances(network, address, abi) {
  const contracts = await fetchTokenContracts(network, address, abi);
  const web3 = createWeb3(network.rpcUrl);
  const balances = {};

  for (const tokenAddress in contracts) {
    const tokenType = contracts[tokenAddress].type;
    const tokenContract = new web3.eth.Contract(abi.abi, tokenAddress);

    console.log(`Looking for balance for ${tokenAddress}, ${tokenContract.name}, ${tokenType} on ${network.name} for ${address}`);
    const balance = await tokenContract.methods.balanceOf(address).call();

    balances[tokenAddress] = {
      type: tokenType,
      balance: balance
    };

    console.log(`Balance for ${tokenAddress}, ${tokenContract.name}, ${tokenType} on ${network.name} for ${address} is ${balance}`);
  }

  return balances;
}

// fetchAllTokenBalances()
// Fetches token balances for each address in the given networks and abis.
// @param {array} networks - An array of network objects with properties name and id.
// @param {array} addresses - An array of Ethereum addresses.
// @param {array} abis - An array of ABI objects with properties type and abi.
// @returns {object} balances - An object containing the token balances for each address in each network.
async function fetchAllTokenBalances(networks, addresses, abis) {
  const balances = {};

  for (const network of networks) {
    for (const address of addresses) {
      for (const abi of abis) {
        console.log(`Fetching balances for ${abi.type} on ${network.name} for ${address}`)
        try {
          balances[network][address] = await fetchTokenBalances(network, address, abi);
        } catch (err) {
          console.log(`Error fetching balances for ${abi.type} on ${network.name} for ${address}:`, err.message);
          throw err;
        }
      }
    }
  }

  return balances;
}

module.exports = {
  fetchTokenContracts,
  fetchTokenBalances,
  fetchAllTokenBalances
};