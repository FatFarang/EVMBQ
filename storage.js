const fs = require('fs');
const path = require('path');

function cacheFilePath(network, address) {
    return path.join(path.join(__dirname, 'cache'), `${network.name}-${address}.json`);
}

function balancesFilePath(network, address) {
    return path.join(path.join(__dirname, 'data'), `${network.name}-${address}.json`);
}

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