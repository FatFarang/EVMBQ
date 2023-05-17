const { fetchAllTokenBalances } = require('./balance');
const { readJsonArrayFromFile } = require('./storage');

/**
 * Main function
 * 
 * Reads in three json files containing addresses, networks, and abis. 
 * Fetches all token balances for each address on each network and 
 * for each abi. 
 * Logs out a json object containing the token balances. 
 * If an error occurs, logs out the error message. 
 */
try {
  /*
  setInterval(() => {
    console.log('Active requests:', process._getActiveRequests());
    console.log('Active handles:', process._getActiveHandles());
  }, 1000);
  */

  const addresses = readJsonArrayFromFile("addresses.json");
  const networks = readJsonArrayFromFile("networks.json");

  fetchAllTokenBalances(networks, addresses).then(balances => {
    console.log(JSON.stringify(balances, null, 4));
  }).catch(err => {
    console.log(err.message);
  });
} catch (err) {
  console.log(err.message);
}