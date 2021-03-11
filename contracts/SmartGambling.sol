// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;

import "https://raw.githubusercontent.com/smartcontractkit/chainlink/master/evm-contracts/src/v0.6/VRFConsumerBase.sol";

// We are using SafeMathChainlink.sol for safe math checks which is imported via VRFConsumerBase

 /**
  * Rinkeby Faucets
  * --
  * After deploying this contract you need to fund it with ETH and LINK.
  * --
  * Testnet LINK is available from https://rinkeby.chain.link/
  * Testnet ETH  is available from https://faucet.rinkeby.io/
  */

contract SmartGambling is VRFConsumerBase {
    
    address public owner;
    bytes32 internal keyHash;
    uint256 internal fee; // ChainLink Fee
    
    // MAKE THESE PRIVATE AFTER DEBUGGING COMPLETED
    bytes32 public lastRequestId;
    uint public lastResult;
    
    uint constant internal MAX_CHOICE = 6;

    struct Bet {
        address playerAddress;
        uint timestamp;
        uint betAmount;
        uint prediction;
    }

    // Mapping: requestId => Bet Details
    mapping(bytes32 => Bet) internal bets;
    
    // Wins to be withdrawn by winners
    mapping(address => uint) internal unclaimedWins;

    // Total of wei owed to players, unclaimed wins
    uint public unclaimedWinsTotal;
    
    // A pending bet is a bet for which we have not received the result from the Oracle yet.
    // This variable stores the sum (in wei) of all pending bets
    uint public pendingBetsTotal;
    
    modifier ownerOnly() {
        require(msg.sender == owner, "This function is restricted to the owner.");
        _;
    }
    
    /* ***************** EVENTS ***************** */
    event BetPlacedEvent (
        address player_address,
        uint timestamp,
        uint amount,
        uint prediction
    );

    event BetResultEvent (
        address player_address,
        bytes32 requestId,
        uint timestamp,
        uint amount,
        uint prediction,
        uint result
    );

    event DepositEvent (address sender_address, string tokenName, uint amount);
    event winsWithdrawEvent (address playerAddress, uint amount);  

    /**
     * Constructor inherits VRFConsumerBase
     * ------------------------------------
     * Network: Rinkeby
     * ETH_CHAIN_ID: 4
     * Name: ChainLink Token
     * Symbol: LINK
     * Decimals: 18
     * Chainlink VRF Coordinator address: 0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B
     * LINK token address:                0x01BE23585060835E02B77ef475b0Cc51aA1e0709
     * Key Hash:  0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311
     * Fee:	0.1 LINK
     * https://docs.chain.link/docs/vrf-contracts
     */
    constructor() 
        VRFConsumerBase(
            0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B, // VRF Coordinator Contract Address on Rinkeby
            0x01BE23585060835E02B77ef475b0Cc51aA1e0709  // LINK Token Contract Address on Rinkeby
        ) public
    {
        owner = msg.sender;
        keyHash = 0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311;
        fee = 0.1 * 10 ** 18; // 0.1 LINK
    }

    // Used to place a bet. The timestamp is used to uniquely identify the bet when when a 
    // user places multiple bets at the same time while older bets are still pending
    function placeBet(uint frontEndTimestamp, uint prediction) public payable {
        uint bet_amount = msg.value;
        require(prediction > 0 && prediction <= MAX_CHOICE, "Prediction must be between 1 and MAX_CHOICE");
        require(bet_amount > 0, "Bet amount must be greater than 0.");

        // Here current contract balance already includes player's bet.
        uint availableContractBalance = address(this).balance.sub(unclaimedWinsTotal).sub(pendingBetsTotal).sub(bet_amount.mul(MAX_CHOICE));
        require(bet_amount <= availableContractBalance, "Bet Amount is > 'real' available contract balance."); 

        // Request random number from ChainLink Oracle
        
        // Mixing data from frontend and current block to prevent an attacker 
        // from predicting the seed thus the random result
        uint256 seed = frontEndTimestamp + block.timestamp; // Not using SafeMath, overflow/underflow does not matter here
        
        Bet memory betDetails = Bet(msg.sender, frontEndTimestamp, msg.value, prediction);
        bytes32 requestId = requestRandomNumber(seed);
        bets[requestId] = betDetails;
        pendingBetsTotal = pendingBetsTotal.add(bet_amount.mul(MAX_CHOICE));
        
        emit BetPlacedEvent(msg.sender, frontEndTimestamp, msg.value, prediction);
        lastRequestId = requestId;
        lastResult = 0;
    }
    
    // Requests randomness from ChainLink Oracle via a user-provided seed
    function requestRandomNumber(uint256 userProvidedSeed) internal returns(bytes32) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee, userProvidedSeed);        
    }

    
    // Callback function called by ChainLink Oracle to send this contract the random result
    function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
        // Only the Oracle Coordinator Contract is allowed to call this function.
        // Prevent someone else from calling it to emulate the Oracle with wining results
        require(msg.sender == 0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B);

        // Random number between 1 and MAX_CHOICE
        uint result = randomness.mod(MAX_CHOICE).add(1);
        lastResult = result;

        emit BetResultEvent(
            bets[requestId].playerAddress,
            requestId,
            bets[requestId].timestamp,
            bets[requestId].betAmount,
            bets[requestId].prediction,
            result
        );
        
        uint winAmount = bets[requestId].betAmount.mul(MAX_CHOICE);
        
        // This bet is no longer pending
        pendingBetsTotal = pendingBetsTotal.sub(winAmount);
        
        // User won: send back MAX_BET times the bet amount
        if(bets[requestId].prediction == result) {
            unclaimedWins[bets[requestId].playerAddress] = unclaimedWins[bets[requestId].playerAddress].add(winAmount);
            unclaimedWinsTotal = unclaimedWinsTotal.add(winAmount);
        }

        // We do not want to keep a full history of all the bets ever made (save gas fees)
        delete bets[requestId];
    }
    
    // For Testing Purposes without ChainLInk
    // function getRandomResult() private view returns(uint) {
    //     return block.timestamp.mod(MAX_CHOICE) + 1;
    // }  

    // Allows user to see unclaimed wins amount
    function getUnclaimedWins() public view returns(uint) {
        return unclaimedWins[msg.sender];
    }

    // Allows user to withdraw unclaimed wins
    function withdrawWins() public {
        uint amount = unclaimedWins[msg.sender];
        require(amount > 0);
        unclaimedWins[msg.sender] = 0;
        unclaimedWinsTotal = unclaimedWinsTotal.sub(amount);
        emit winsWithdrawEvent(msg.sender, amount);
        payable(msg.sender).transfer(amount);

        // Remove player from mapping
        delete unclaimedWins[msg.sender];
    }

    // Get Contract Balance in Wei minus the unclaimed wins and pending bets
    function getRealEthBalance() public view returns(uint) {
        uint realBalance = address(this).balance.sub(unclaimedWinsTotal).sub(pendingBetsTotal);
        return realBalance;
    }
    
    // Withdraw all Wei, except unclaimed wins and pending bets
    function withdrawAllEth() public ownerOnly {
        require(address(this).balance > 0);
        payable(msg.sender).transfer(getRealEthBalance()); 
    }

    // Withdraw all LINK from this contract
    function withdrawAllChainLink() public ownerOnly {
        require(getChainLinkBalance() > 0);
        require(LINK.transfer(msg.sender, getChainLinkBalance()), "Unable to transfer");
    }
    
    // Get LINK token balance in the contract
    function getChainLinkBalance() public view returns(uint) {
        return LINK.balanceOf(address(this));
    }
    
    // Deposit Wei into the Contract
    function deposit() public payable {
        require(msg.value > 0, "Deposit amount must be grater than 0.");
        emit DepositEvent(msg.sender, "ETH", msg.value);
    }
    
    // Accept transfers sent directly to contract address
    receive() external payable { 
        deposit();
    }
}