
$(document).ready(function() {
  window.ethereum.enable()
  .then(function(accounts) {
    window.accountAddress = accounts[0];
    window.contractInstance = new web3.eth.Contract(window.abi, window.contractAddress, {from: accounts[0]});
    displayBalance(accountAddress, "AccountBalanceText", "Account Balance: ");
    displayBalance(contractAddress, "ContractBalanceText", "Contract Balance: ");
  });
  $("#deposit_button").click(depositEth);
});

function depositEth() {

  if(!contractInstance) {
    alert("Please log in to Metamask first.");
    return;
  }

  let depositAmount = parseInt($("#deposit_amount_input").val(), 10);

  // Amount must be positive integer
  if(depositAmount <= 0) {
    printMessage("Error: Amount must be a positive integer.");
    return;
  }

  contractInstance.methods.deposit().send({value: depositAmount})
    .on('transactionHash', function(hash){
      console.log("tx hash: " + hash);
      alert("Click ok and wait for deposit to be completed. A pop will appear when the deposit has been confirmed.");
      //location.reload();
    })
    .on('confirmation', function(confirmationNumber, receipt){
        console.log("Confirmation: " + confirmationNumber);
    })
    .on('receipt', function(receipt){
      console.log("Receipt:\n" + receipt);
    });

    contractInstance.events.DepositEvent()
    .on('data', (event) => {
      displayBalance(accountAddress, "AccountBalanceText", "Account Balance: ");
      displayBalance(contractAddress, "ContractBalanceText", "Contract Balance: ");
      alert(`Deposit Successful! You deposited: ${event.returnValues.amount} wei.`);
    })
    .on('error', console.error);
}

