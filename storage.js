const fs = require('fs');
const path = require('path');

/**
Constructs a file path string to cache data based on network name and address
@param {Object} network - Object containing information about the network
@param {string} address - Address of the contract to be cached
@return {string} - File path string to cache data
*/
function cacheFilePath(network, address) {
    return path.join(path.join(__dirname, 'cache'), `${network.name}-${address}.json`);
}

/**
Constructs a file path string to save balance data based on network name and address
@param {Object} network - Object containing information about the network
@param {string} address - Address of the contract to be cached
@return {string} - File path string to save balance data
*/
function balancesFilePath(network, address) {
    return path.join(path.join(__dirname, 'data'), `${network.name}-${address}.json`);
}

/**
Loads cached data from file, returning contracts and lastBlock data
@param {Object} network - Object containing information about the network
@param {string} address - Address of the contract to be cached
@return {Object} - Object containing cached contracts and lastBlock data
*/
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

/**
Saves cached data to file based on network name and address
@param {Object} network - Object containing information about the network
@param {string} address - Address of the contract to be cached
@param {number} endBlock - The end block of the data to be cached
@param {Object} contracts - Object containing contracts to be cached
*/
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

/**
Saves balance data to file based on network name and address
@param {Object} network - Object containing information about the network
@param {string} address - Address of the contract to be cached
@param {Object} balances - Object containing balances to be saved
*/
function saveBalanceData(network, address, balances) {
    const filepath = balancesFilePath(network, address);

    if (!fs.existsSync(path.dirname(filepath))) {
        fs.mkdirSync(path.dirname(filepath));
    }

    if (Object.keys(balances).length > 0) {
        fs.writeFileSync(filepath, JSON.stringify(balances, null, 4));
    }
}

module.exports = {
    saveCachedData,
    loadCachedData,
    saveBalanceData
}