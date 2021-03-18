/*************************************************************
  * Allows the frontend to interact with the smart contract 
  * on the blockchain using Web3.js 
  ************************************************************/

var web3 = new Web3(Web3.givenProvider);
var accountAddress;
var contractInstance;
var contractAddress = "0x57Ac66F98dc9C11289B961CDbAae0BC48330872a";  
var contractURL = `https://rinkeby.etherscan.io/address/${contractAddress}`;

// Initialize the Page and load Metamask
$(document).ready(function() {
  enableEthereum();
  $("#bet_button").click(placeBet);
  $("#withdraw_button").click(withdrawWins);

  document.getElementById("contract_link").href = contractURL;
  document.getElementById("contract_link").title = contractURL;
  document.getElementById("contract_link").innerHTML = contractAddress;
  showResultDice(0);
});

// Activate Metamask and Initialize the Contract Instance
function enableEthereum() {
  window.ethereum.enable()
  .then(function(accounts) {
    window.accountAddress = accounts[0];
    window.contractInstance = new web3.eth.Contract(window.abi, window.contractAddress, {from: accounts[0]});
    refreshBalances();
  });
}

// Update the Result Dice Image
// 0 = No result yet [?], 1-6 shows corresponding dice, -1 = animated dice
function showResultDice(dice) {
  if(dice >= 0) {
    document.getElementById('ResultDice').src = `images/dices/dice${dice}.png`;
  }
  else {
    document.getElementById('ResultDice').src = 'images/dices/animated-dice.gif';
  }
}

// Updates all the balances on the page
// 1. Account Balance
// 2. Contract Balance
// 3. Unclaimed Wins
// 4. Cahinlink Balance
function refreshBalances(){
    displayETHBalance(accountAddress, "AccountBalanceText", "Account Balance: ");
    displayETHBalance(contractAddress, "ContractBalanceText", "Contract Balance: ");
    getWithdrawableWins();
    getChainLinkBalance();
}

// Allow user to withdraw his unclaimed wins to his wallet
function getWithdrawableWins() {
  contractInstance.methods.getUnclaimedWins().call()
  .then(result => {
    result = web3.utils.fromWei(result, 'ether');
    document.getElementById("withdraw_amount_input").placeholder = `${result} ETH`;
    document.getElementById("UnclaimedWinsText").innerHTML = `Unclaimed Wins: ${result} ETH`;
  });
}

// Get the LINK balance for this contract
function getChainLinkBalance() {
  contractInstance.methods.getChainLinkBalance().call()
  .then(result => {
    document.getElementById("ContractLinkBalanceText").innerHTML = `ChainLink Balance: ${web3.utils.fromWei(result, 'ether')} LINK`;
  });
}

// Allow user to withdraw his unclaimed wins in the contract
async function withdrawWins() {
  new Audio('sounds/click2.mp3').play();
  let amount = await contractInstance.methods.getUnclaimedWins().call();

  if(amount > 0) {

    contractInstance.methods.withdrawWins().send()
    .on('transactionHash', function(hash){
      console.log("tx hash:\n", hash);
      printMessage("Waiting for transaction to complete ...");
    })
    .on('confirmation', function(confirmationNumber, receipt){
        console.log("Confirmation: ", confirmationNumber);
    })
    .on('receipt', function(receipt){
      console.log("Receipt:\n", receipt);
    });

    // Wait for winsWithdrawEvent
    contractInstance.events.winsWithdrawEvent({ filter: {user: web3.eth.accounts[0]}, fromBlock: "latest" })
    .on('data', (event) => {
      //let requestId = event.returnValues.requestId;
      refreshBalances();
      printMessage("Your withdraw has been completed.");
    })
    .on('error', console.error);
  }
  else {
    printMessage("No wins to withdraw");
    alert("No wins to withdraw");
  }
}

// Place the bet on the smart contract
function placeBet(){ 

  new Audio('sounds/click2.mp3').play();
  showResultDice(0);

  if(!contractInstance) {
    printMessage("Please log in to Metamask first.");
    return;
  }

  let playerPrediction = $('input[name=prediction]:checked').val();    

  // Amount must be positive integer
  let betAmount = $("#bet_amount_input").val(); 
  if(betAmount == null || betAmount == "") {
    printMessage("Error: Please enter a bet amount.");
    return;
  }
  else if(parseInt(betAmount) <= 0) {
    printMessage("Error: Amount must be a positive integer.");
    return;
  }

  // If the user is simultaneously placing multiple bets using the 
  // same address with multiple browsers for example, we use the timestamp
  // to distinguish them
  var timestamp = Date.now();

  printMessage("Waiting for your bet to be placed on the blockchain ..."); 

  // Place the bet on the contract
  contractInstance.methods.placeBet(timestamp, playerPrediction).send({value: betAmount})
    .on('transactionHash', function(hash){
      console.log("tx hash:\n", hash);
    })
    .on('confirmation', function(confirmationNumber, receipt){
        console.log("Confirmation: ", confirmationNumber);
    })
    .on('receipt', function(receipt){
      console.log("Receipt:\n", receipt);
    });

    // Wait for BetPlacedEvent confirmning the bet has been placed
    contractInstance.events.BetPlacedEvent({ filter: {user: web3.eth.accounts[0]}, fromBlock: "latest" })
    .on('data', (event) => {
      //console.log("BetEvent:", event);
      refreshBalances();
      showResultDice(-1);
      printMessage("Your bet has been placed.<br/>Waiting for result ...");
    })
    .on('error', console.error);

    // Wait for BetResultEvent
    contractInstance.events.BetResultEvent()
    .on('data', (event) => {
      if(accountAddress.toLowerCase() == event.returnValues.player_address.toLowerCase() && 
          timestamp == event.returnValues.timestamp) {
          console.log("BetResultEvent:", event);
          let result = event.returnValues.result;
          refreshBalances();
          showResultDice(result);
          if (playerPrediction === result) {
            new Audio('sounds/win.mp3').play();
            printMessage(`You won ${betAmount*5} wei!<br/>`+
            `Your prediction was ${playerPrediction} and the result was ${result}<br/>`+
            "You can now withdraw your wins + your initial bet.");
          }
          else { 
            new Audio('sounds/the-price-is-right-losing-horn.mp3').play();
            printMessage(`You lost ${betAmount} wei!<br/>`+
            `Your prediction was ${playerPrediction} and the result was ${result}<br/>`);
          }
      }
    })
    .on('error', console.error); 
}

// Print a new message in the application message box
function printMessage(message) {
  document.getElementById("Messages").innerHTML = message;
}

// Get the ETH balance for an address and display it on the 'elementId' on the page
function displayETHBalance(address, elementId, prefix) {
    try {
        web3.eth.getBalance(address, function (error, wei) {
            if (!error) {
                let balance = web3.utils.fromWei(wei, 'ether');
                document.getElementById(elementId).innerHTML = `${prefix} ${balance} ETH`;
            }
        });
    } catch (err) {
        document.getElementById(elementId).innerHTML = err;
    }
}

// Returns true if the string str is a positive integer
function isNormalInteger(str) {
  str = str.trim();
  if (!str) {
      return false;
  }
  str = str.replace(/^0+/, "") || "0";
  let n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n >= 0;
}

  