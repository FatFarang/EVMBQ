const { readBalancesFromDirectory, readJsonArrayFromFile } = require('./storage');
const fs = require('fs');

const networks = readJsonArrayFromFile("networks.json");

function generateHTML(balances) {
  let html = `
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
  
        h2 {
          margin-top: 30px;
          margin-bottom: 10px;
        }
  
        table {
          border-collapse: collapse;
          width: 100%;
        }
  
        th,
        td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
  
        th {
          background-color: #f2f2f2;
        }
      </style>
    </head>
    <body>
      <h1>Token Balances</h1>
  `;

  Object.keys(balances).forEach((network) => {
    html += `
        <h2>${network}</h2>
        <table>
          <tr>
            <th>Address</th>
            <th>Status</th>
            <th>Token Contract</th>            
            <th>Balance</th>
          </tr>
    `;

    Object.keys(balances[network]).forEach((address) => {
      balances[network][address].forEach((tokenContracts) => {
        Object.keys(tokenContracts).forEach((tokenContract) => {
          if(parseInt(tokenContracts[tokenContract].balance) === 0) return;
          const color = '#' + address.substring(2,8) + 'A0';
          const explorer = networks.find(n => n.name == network)?.explorer || 'https://etherscan.io';          

          html += `
          <tr style="background-color: ${color}; font-family: monospace; font-size: 12px;">
            <td><a target="_blank" href="${explorer}/address/${address}">${address}</a></td>
            <td>${tokenContracts[tokenContract].status}</td>
            <td><a target="_blank" href="${explorer}/token/${tokenContract}">${tokenContract}</a></td>
            <td>${tokenContracts[tokenContract].balance}</td>
          </tr>
        `;
        })
      });
    });

    html += `
        </table>
    `;
  });

  html += `
    </body>
    </html>
  `;

  return html;
}

// Application
const directoryPath = './data';
const balances = readBalancesFromDirectory(directoryPath);
const htmlOutput = generateHTML(balances);

// Write HTML output to a file
fs.writeFileSync('balances.html', htmlOutput);
console.log('HTML output generated: balances.html');
