const { fetchAllTokenBalances } = require('./balance');
const fs = require('fs');

// readJsonArrayFromFile()
// Reads a JSON array from a file and returns it as an array.
// @param {string} filePath - The path to the file containing the JSON array.
// @returns {array} jsonArray - The parsed JSON array.
function readJsonArrayFromFile(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const jsonArray = JSON.parse(fileContent);
  return jsonArray;
}

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